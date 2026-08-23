package models

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
)

// Message is one item on a queue.
type Message struct {
	// ID is stable for the life of the message, across redeliveries.
	ID string `json:"id"`

	// Body is the payload. Opaque to Red.
	Body string `json:"body"`

	// Attributes are optional user metadata carried with the message.
	Attributes map[string]string `json:"attributes,omitempty"`

	// ReceiveCount is how many times this message has been delivered. Used for
	// dead-lettering.
	ReceiveCount int `json:"receive_count"`

	// EnqueuedAt is when the message was first sent (unix millis).
	EnqueuedAt int64 `json:"enqueued_at"`

	// ReceiptHandle is set only on a received message. It identifies this
	// specific receive and is required to delete or extend the message; it
	// changes on every receive, so a delete with a stale handle is safely
	// ignored (the message was already redelivered).
	ReceiptHandle string `json:"receipt_handle,omitempty"`

	// TraceContext carries W3C traceparent/tracestate from the sender, so a
	// consumer can continue the producer's trace across the queue.
	TraceContext map[string]string `json:"trace_context,omitempty"`
}

// SendMessageRequest sends one message.
type SendMessageRequest struct {
	Body       string            `json:"body"`
	Attributes map[string]string `json:"attributes,omitempty"`
	// DelaySeconds hides the message for this long before it first becomes
	// visible. Zero means immediately visible.
	DelaySeconds int `json:"delay_seconds,omitempty"`
}

const maxMessageBytes = 256 * 1024 // 256 KB, like SQS

// Validate checks a send request.
func (r *SendMessageRequest) Validate() error {
	if r.Body == "" {
		return &ValidationError{Field: "body", Message: "body is required"}
	}
	if len(r.Body) > maxMessageBytes {
		return &ValidationError{Field: "body", Message: fmt.Sprintf("body must be at most %d bytes", maxMessageBytes)}
	}
	if r.DelaySeconds < 0 || r.DelaySeconds > 900 {
		return &ValidationError{Field: "delay_seconds", Message: "must be between 0 and 900"}
	}
	return nil
}

// ReceiveMessagesRequest receives up to MaxMessages.
type ReceiveMessagesRequest struct {
	// MaxMessages caps the batch. Defaults to 1, max 10 (like SQS).
	MaxMessages int `json:"max_messages,omitempty"`

	// VisibilityTimeoutSeconds overrides the queue default for this receive.
	// Zero uses the queue's setting.
	VisibilityTimeoutSeconds int `json:"visibility_timeout_seconds,omitempty"`

	// WaitTimeSeconds enables long polling: wait up to this long for a message
	// to arrive rather than returning empty immediately. Zero is a short poll.
	WaitTimeSeconds int `json:"wait_time_seconds,omitempty"`
}

// Normalize clamps the request to valid bounds.
func (r *ReceiveMessagesRequest) Normalize() {
	if r.MaxMessages <= 0 {
		r.MaxMessages = 1
	}
	if r.MaxMessages > 10 {
		r.MaxMessages = 10
	}
	if r.WaitTimeSeconds < 0 {
		r.WaitTimeSeconds = 0
	}
	if r.WaitTimeSeconds > 20 {
		r.WaitTimeSeconds = 20
	}
	if r.VisibilityTimeoutSeconds < 0 {
		r.VisibilityTimeoutSeconds = 0
	}
	if r.VisibilityTimeoutSeconds > maxVisibilityTimeout {
		r.VisibilityTimeoutSeconds = maxVisibilityTimeout
	}
}

// NewMessageID returns a random opaque message id.
func NewMessageID() string { return "msg-" + randomHex(12) }

// NewReceiptHandle returns a random opaque receipt handle.
func NewReceiptHandle() string { return "rh-" + randomHex(16) }

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic("red: cannot read random bytes: " + err.Error())
	}
	return hex.EncodeToString(b)
}

// DeleteMessageRequest acks a received message by its receipt handle.
type DeleteMessageRequest struct {
	ReceiptHandle string `json:"receipt_handle"`
}

// Validate checks a delete request.
func (r *DeleteMessageRequest) Validate() error {
	if strings.TrimSpace(r.ReceiptHandle) == "" {
		return &ValidationError{Field: "receipt_handle", Message: "receipt_handle is required"}
	}
	return nil
}
