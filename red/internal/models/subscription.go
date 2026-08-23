package models

import (
	"fmt"
	"strings"
)

// Subscription connects a queue to an Impuls function, so messages sent to the
// queue trigger the function - the SQS-to-Lambda pattern, and the piece that
// makes Red "integratable with stuff".
//
// A background dispatcher receives messages from the queue and invokes the
// function for each one. On a successful invocation the message is deleted
// (acked); on a failure it is left to the queue's visibility timeout, which
// redelivers it and, past the queue's max-receive-count, dead-letters it. Red
// therefore gets automatic retry and dead-lettering of function work for free
// from the queue machinery it already has.
type Subscription struct {
	// Name uniquely identifies the subscription.
	Name string `json:"name"`

	// Queue is the source queue.
	Queue string `json:"queue"`

	// Function is the Impuls function invoked for each message.
	Function string `json:"function"`

	// BatchSize is how many messages the dispatcher pulls per cycle (1-10).
	BatchSize int `json:"batch_size"`

	// Enabled gates delivery; a disabled subscription stays configured but
	// stops invoking, which is how you pause a consumer without deleting it.
	Enabled bool `json:"enabled"`

	CreatedAt string `json:"created_at"`

	// Runtime counters, updated by the dispatcher.
	DeliveredTotal int64  `json:"delivered_total"`
	FailedTotal    int64  `json:"failed_total"`
	LastError      string `json:"last_error,omitempty"`
	LastDeliveryAt string `json:"last_delivery_at,omitempty"`
}

// subscriptionNameRe constrains a subscription name (a bbolt key and URL
// segment).
var subscriptionNameRe = queueNameRe

// CreateSubscriptionRequest is the body of a subscription-creation call.
type CreateSubscriptionRequest struct {
	Name      string `json:"name"`
	Queue     string `json:"queue"`
	Function  string `json:"function"`
	BatchSize int    `json:"batch_size,omitempty"`
	// Enabled defaults to true when omitted.
	Enabled *bool `json:"enabled,omitempty"`
}

// Validate checks the request and fills in defaults, returning a ready
// Subscription. It does not check that the queue or function exist; the caller
// verifies the queue, and a missing function surfaces as delivery failures the
// operator can see, rather than blocking creation.
func (r *CreateSubscriptionRequest) Validate() (*Subscription, error) {
	name := strings.TrimSpace(r.Name)
	if !subscriptionNameRe.MatchString(name) {
		return nil, &ValidationError{Field: "name", Message: "name must be 1-128 characters of letters, digits, and . _ -"}
	}
	queue := strings.TrimSpace(r.Queue)
	if !IsValidQueueName(queue) {
		return nil, &ValidationError{Field: "queue", Message: "a valid source queue is required"}
	}
	fn := strings.TrimSpace(r.Function)
	if fn == "" {
		return nil, &ValidationError{Field: "function", Message: "a target function is required"}
	}
	batch := r.BatchSize
	if batch <= 0 {
		batch = 1
	}
	if batch > 10 {
		return nil, &ValidationError{Field: "batch_size", Message: "must be between 1 and 10"}
	}
	enabled := true
	if r.Enabled != nil {
		enabled = *r.Enabled
	}
	return &Subscription{
		Name:      name,
		Queue:     queue,
		Function:  fn,
		BatchSize: batch,
		Enabled:   enabled,
	}, nil
}

// IsValidSubscriptionName reports whether a name is safe to use in a path.
func IsValidSubscriptionName(name string) bool { return subscriptionNameRe.MatchString(name) }

// UpdateSubscriptionRequest changes a subscription's operational settings.
// Enabled pauses or resumes delivery without deleting the subscription; the
// queue and function bindings are fixed at creation and cannot be patched (make
// a new subscription to change them). Omitted fields are left unchanged.
type UpdateSubscriptionRequest struct {
	Enabled   *bool `json:"enabled,omitempty"`
	BatchSize *int  `json:"batch_size,omitempty"`
}

// Apply validates the patch and writes the changed fields onto sub.
func (r *UpdateSubscriptionRequest) Apply(sub *Subscription) error {
	if r.Enabled != nil {
		sub.Enabled = *r.Enabled
	}
	if r.BatchSize != nil {
		b := *r.BatchSize
		if b < 1 || b > 10 {
			return &ValidationError{Field: "batch_size", Message: "must be between 1 and 10"}
		}
		sub.BatchSize = b
	}
	return nil
}

// InvokeURL builds the Impuls invoke URL for this subscription's function.
func (s *Subscription) InvokeURL(impulsBase string) string {
	return fmt.Sprintf("%s/api/v1/functions/%s/invoke", strings.TrimRight(impulsBase, "/"), s.Function)
}
