package models

import (
	"fmt"
	"strings"
	"time"
)

// Bucket represents a storage bucket
type Bucket struct {
	Name        string            `json:"name"`
	CreatedAt   time.Time         `json:"created_at"`
	Policy      string            `json:"policy,omitempty"` // "private", "public-read", "public-read-write"
	Versioning  bool              `json:"versioning"`
	ObjectCount int64             `json:"object_count,omitempty"`
	TotalSize   int64             `json:"total_size,omitempty"`
	Tags        map[string]string `json:"tags,omitempty"`
}

// CreateBucketRequest represents a request to create a bucket
type CreateBucketRequest struct {
	Name       string            `json:"name"`
	Policy     string            `json:"policy,omitempty"` // "private" (default), "public-read", "public-read-write"
	Versioning bool              `json:"versioning,omitempty"`
	Tags       map[string]string `json:"tags,omitempty"`
}

// Validate validates the CreateBucketRequest
func (r *CreateBucketRequest) Validate() error {
	if r.Name == "" {
		return fmt.Errorf("bucket name is required")
	}
	if len(r.Name) < 3 || len(r.Name) > 63 {
		return fmt.Errorf("bucket name must be between 3 and 63 characters")
	}
	if strings.Contains(r.Name, "..") {
		return fmt.Errorf("bucket name cannot contain '..'")
	}
	for _, c := range r.Name {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.') {
			return fmt.Errorf("bucket name can only contain lowercase letters, numbers, hyphens, and periods")
		}
	}
	return nil
}

// UpdateBucketRequest represents a request to update bucket settings
type UpdateBucketRequest struct {
	Policy     *string           `json:"policy,omitempty"`
	Versioning *bool             `json:"versioning,omitempty"`
	Tags       map[string]string `json:"tags,omitempty"`
}
