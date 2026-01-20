package models

import "time"

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

// UpdateBucketRequest represents a request to update bucket settings
type UpdateBucketRequest struct {
	Policy     *string           `json:"policy,omitempty"`
	Versioning *bool             `json:"versioning,omitempty"`
	Tags       map[string]string `json:"tags,omitempty"`
}
