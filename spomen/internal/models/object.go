package models

import "time"

// Object represents a stored object
type Object struct {
	Key            string            `json:"key"`
	Size           int64             `json:"size"`
	ContentType    string            `json:"content_type"`
	ETag           string            `json:"etag"`
	LastModified   time.Time         `json:"last_modified"`
	Metadata       map[string]string `json:"metadata,omitempty"`
	VersionID      string            `json:"version_id,omitempty"`
	IsDeleteMarker bool              `json:"is_delete_marker,omitempty"`
}

// ObjectList represents a paginated list of objects
type ObjectList struct {
	Objects        []Object `json:"objects"`
	Prefix         string   `json:"prefix,omitempty"`
	Delimiter      string   `json:"delimiter,omitempty"`
	IsTruncated    bool     `json:"is_truncated"`
	NextMarker     string   `json:"next_marker,omitempty"`
	CommonPrefixes []string `json:"common_prefixes,omitempty"` // For directory-like listing
}

// PresignedURLRequest represents a request for a presigned URL
type PresignedURLRequest struct {
	Key       string `json:"key"`
	ExpiresIn int    `json:"expires_in"` // Seconds (default: 3600)
	Method    string `json:"method"`     // "GET" or "PUT"
}

// PresignedURLResponse represents a presigned URL response
type PresignedURLResponse struct {
	URL       string    `json:"url"`
	Key       string    `json:"key"`
	Method    string    `json:"method"`
	ExpiresAt time.Time `json:"expires_at"`
}

// CopyObjectRequest represents a request to copy an object
type CopyObjectRequest struct {
	SourceBucket string            `json:"source_bucket"`
	SourceKey    string            `json:"source_key"`
	DestKey      string            `json:"dest_key"`
	Metadata     map[string]string `json:"metadata,omitempty"`
}

// MultipartUpload represents an in-progress multipart upload
type MultipartUpload struct {
	UploadID  string    `json:"upload_id"`
	Key       string    `json:"key"`
	Initiated time.Time `json:"initiated"`
}
