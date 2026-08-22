package models

import "time"

// IssueCredentialsRequest requests per-user S3 credentials scoped to specific buckets.
type IssueCredentialsRequest struct {
	UserID    int      `json:"user_id"`
	Buckets   []string `json:"buckets"`
	ReadWrite bool     `json:"read_write"`
}

// IssueCredentialsResponse returns generated credentials and connection details.
type IssueCredentialsResponse struct {
	AccessKey string    `json:"access_key"`
	SecretKey string    `json:"secret_key"`
	Endpoint  string    `json:"endpoint"`
	Region    string    `json:"region"`
	Buckets   []string  `json:"buckets"`
	ExpiresAt time.Time `json:"expires_at,omitempty"`
}
