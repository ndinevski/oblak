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

	// ErrNotSupported is returned when the backing engine or registry refuses
	// an operation it does not implement, most commonly image deletion on a
	// registry started without delete support.
	ErrNotSupported = errors.New("not supported by the backing service")

	// ErrEngineUnavailable is returned when the container engine cannot be
	// reached at all.
	ErrEngineUnavailable = errors.New("container engine unavailable")
)

// IsValidationError reports whether err is a field validation failure.
func IsValidationError(err error) bool {
	var ve *ValidationError
	return errors.As(err, &ve)
}
