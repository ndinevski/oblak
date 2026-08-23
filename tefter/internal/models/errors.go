package models

import (
	"errors"
	"fmt"
)

// ValidationError reports a single malformed request field. Matching the shape
// the other Oblak services use keeps error responses consistent across the
// platform.
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

// Sentinel errors the API layer maps onto HTTP status codes, so handlers do
// not have to pattern-match on error strings.
var (
	// ErrNotFound is returned when a repository, image or container does not
	// exist.
	ErrNotFound = errors.New("not found")

	// ErrAlreadyExists is returned when creating something whose name is
	// already taken.
	ErrAlreadyExists = errors.New("already exists")

	// ErrNotSupported is returned when an operation is not implemented for the
	// engine in question.
	ErrNotSupported = errors.New("not supported for this engine")

	// ErrEngineUnavailable is returned when the container runtime cannot be
	// reached at all.
	ErrEngineUnavailable = errors.New("container runtime unavailable")

	// ErrInstanceNotReady is returned when an instance exists but is not in a
	// state that allows the requested operation, such as backing up a stopped
	// database.
	ErrInstanceNotReady = errors.New("instance is not available")

	// ErrHasReplicas is returned when deleting a primary that still has
	// replicas following it, which would leave them orphaned.
	ErrHasReplicas = errors.New("instance still has replicas")
)

// IsValidationError reports whether err is a field validation failure.
func IsValidationError(err error) bool {
	var ve *ValidationError
	return errors.As(err, &ve)
}
