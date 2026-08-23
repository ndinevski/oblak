// Package models defines Red's core types: queues, messages, and the requests
// that operate on them.
//
// Red is a message queue in the shape of Amazon SQS. A queue holds messages;
// a consumer receives a message (which makes it invisible for a visibility
// timeout), processes it, and deletes it. If the consumer does not delete it in
// time, the message becomes visible again and is redelivered - this is the
// at-least-once contract. A message that is received too many times is moved to
// a dead-letter queue.
package models

import (
	"fmt"
	"regexp"
	"strings"
)

// Queue is a named message queue with its delivery policy.
type Queue struct {
	Name string `json:"name"`

	// VisibilityTimeoutSeconds is how long a received message stays invisible
	// before it is redelivered, unless deleted first.
	VisibilityTimeoutSeconds int `json:"visibility_timeout_seconds"`

	// MessageRetentionSeconds is how long an unconsumed message is kept before
	// it expires.
	MessageRetentionSeconds int `json:"message_retention_seconds"`

	// MaxReceiveCount, when > 0 together with DeadLetterQueue, moves a message
	// to the dead-letter queue after it has been received this many times
	// without being deleted. Zero disables dead-lettering.
	MaxReceiveCount int `json:"max_receive_count,omitempty"`

	// DeadLetterQueue is the queue failed messages are moved to.
	DeadLetterQueue string `json:"dead_letter_queue,omitempty"`

	CreatedAt string `json:"created_at"`

	// Depth fields are computed at read time, not stored.
	VisibleMessages  int64 `json:"visible_messages"`
	InFlightMessages int64 `json:"in_flight_messages"`
}

// QueueStats is a queue's live depth, reported separately so a caller can poll
// it cheaply.
type QueueStats struct {
	Queue            string `json:"queue"`
	VisibleMessages  int64  `json:"visible_messages"`
	InFlightMessages int64  `json:"in_flight_messages"`
	// OldestMessageAgeSeconds is the age of the oldest visible message, which is
	// the signal that a queue is backing up.
	OldestMessageAgeSeconds int64 `json:"oldest_message_age_seconds"`
}

// queueNameRe constrains a queue name: it is a bbolt bucket name and a URL
// segment.
var queueNameRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)

// IsValidQueueName reports whether a name is safe to use in a path.
func IsValidQueueName(name string) bool { return queueNameRe.MatchString(name) }

// UpdateQueueRequest changes a queue's operational settings after creation.
// Every field is a pointer so that omitting one leaves it unchanged; only the
// fields present in the request are applied. The queue name and its message
// contents are never touched.
type UpdateQueueRequest struct {
	VisibilityTimeoutSeconds *int    `json:"visibility_timeout_seconds,omitempty"`
	MessageRetentionSeconds  *int    `json:"message_retention_seconds,omitempty"`
	MaxReceiveCount          *int    `json:"max_receive_count,omitempty"`
	DeadLetterQueue          *string `json:"dead_letter_queue,omitempty"`
}

// Apply validates the patch and writes the changed fields onto q. It does not
// verify that a named dead-letter queue exists; the store does that, since it
// has the other queues in view.
func (r *UpdateQueueRequest) Apply(q *Queue) error {
	if r.VisibilityTimeoutSeconds != nil {
		v := *r.VisibilityTimeoutSeconds
		if v < 0 || v > maxVisibilityTimeout {
			return &ValidationError{Field: "visibility_timeout_seconds", Message: fmt.Sprintf("must be between 0 and %d", maxVisibilityTimeout)}
		}
		q.VisibilityTimeoutSeconds = v
	}
	if r.MessageRetentionSeconds != nil {
		v := *r.MessageRetentionSeconds
		if v < 60 || v > maxRetention {
			return &ValidationError{Field: "message_retention_seconds", Message: fmt.Sprintf("must be between 60 and %d", maxRetention)}
		}
		q.MessageRetentionSeconds = v
	}
	if r.MaxReceiveCount != nil {
		if *r.MaxReceiveCount < 0 {
			return &ValidationError{Field: "max_receive_count", Message: "must not be negative"}
		}
		q.MaxReceiveCount = *r.MaxReceiveCount
	}
	if r.DeadLetterQueue != nil {
		dlq := strings.TrimSpace(*r.DeadLetterQueue)
		if dlq != "" {
			if !queueNameRe.MatchString(dlq) {
				return &ValidationError{Field: "dead_letter_queue", Message: "not a valid queue name"}
			}
			if dlq == q.Name {
				return &ValidationError{Field: "dead_letter_queue", Message: "a queue cannot be its own dead-letter queue"}
			}
		}
		q.DeadLetterQueue = dlq
	}
	// A dead-letter policy is only meaningful with both parts.
	if q.MaxReceiveCount > 0 && q.DeadLetterQueue == "" {
		return &ValidationError{Field: "dead_letter_queue", Message: "a dead-letter queue is required when max_receive_count is set"}
	}
	return nil
}

const (
	defaultVisibilityTimeout = 30
	defaultRetention         = 4 * 24 * 3600 // 4 days, like SQS
	maxVisibilityTimeout     = 12 * 3600     // 12 hours, like SQS
	maxRetention             = 14 * 24 * 3600
)

// CreateQueueRequest is the body of a queue-creation call.
type CreateQueueRequest struct {
	Name                     string `json:"name"`
	VisibilityTimeoutSeconds int    `json:"visibility_timeout_seconds,omitempty"`
	MessageRetentionSeconds  int    `json:"message_retention_seconds,omitempty"`
	MaxReceiveCount          int    `json:"max_receive_count,omitempty"`
	DeadLetterQueue          string `json:"dead_letter_queue,omitempty"`
}

// Validate checks the request and fills in defaults, returning a ready Queue.
func (r *CreateQueueRequest) Validate() (*Queue, error) {
	name := strings.TrimSpace(r.Name)
	if !queueNameRe.MatchString(name) {
		return nil, &ValidationError{
			Field:   "name",
			Message: "name must be 1-128 characters of letters, digits, and . _ -, starting with a letter or digit",
		}
	}

	vis := r.VisibilityTimeoutSeconds
	if vis == 0 {
		vis = defaultVisibilityTimeout
	}
	if vis < 0 || vis > maxVisibilityTimeout {
		return nil, &ValidationError{Field: "visibility_timeout_seconds", Message: fmt.Sprintf("must be between 0 and %d", maxVisibilityTimeout)}
	}

	ret := r.MessageRetentionSeconds
	if ret == 0 {
		ret = defaultRetention
	}
	if ret < 60 || ret > maxRetention {
		return nil, &ValidationError{Field: "message_retention_seconds", Message: fmt.Sprintf("must be between 60 and %d", maxRetention)}
	}

	if r.MaxReceiveCount < 0 {
		return nil, &ValidationError{Field: "max_receive_count", Message: "must not be negative"}
	}
	dlq := strings.TrimSpace(r.DeadLetterQueue)
	if r.MaxReceiveCount > 0 && dlq == "" {
		return nil, &ValidationError{Field: "dead_letter_queue", Message: "a dead-letter queue is required when max_receive_count is set"}
	}
	if dlq != "" {
		if !queueNameRe.MatchString(dlq) {
			return nil, &ValidationError{Field: "dead_letter_queue", Message: "not a valid queue name"}
		}
		if dlq == name {
			return nil, &ValidationError{Field: "dead_letter_queue", Message: "a queue cannot be its own dead-letter queue"}
		}
	}

	return &Queue{
		Name:                     name,
		VisibilityTimeoutSeconds: vis,
		MessageRetentionSeconds:  ret,
		MaxReceiveCount:          r.MaxReceiveCount,
		DeadLetterQueue:          dlq,
	}, nil
}
