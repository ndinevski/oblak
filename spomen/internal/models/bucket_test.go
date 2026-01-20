package models

import (
	"testing"
)

func TestBucketValidation(t *testing.T) {
	tests := []struct {
		name    string
		bucket  CreateBucketRequest
		wantErr bool
	}{
		{
			name:    "valid bucket name",
			bucket:  CreateBucketRequest{Name: "my-bucket"},
			wantErr: false,
		},
		{
			name:    "valid bucket with policy",
			bucket:  CreateBucketRequest{Name: "test-bucket", Policy: "public-read"},
			wantErr: false,
		},
		{
			name:    "valid bucket with versioning",
			bucket:  CreateBucketRequest{Name: "versioned-bucket", Versioning: true},
			wantErr: false,
		},
		{
			name:    "empty bucket name",
			bucket:  CreateBucketRequest{Name: ""},
			wantErr: true,
		},
		{
			name:    "bucket name too short",
			bucket:  CreateBucketRequest{Name: "ab"},
			wantErr: true,
		},
		{
			name:    "bucket name with uppercase",
			bucket:  CreateBucketRequest{Name: "MyBucket"},
			wantErr: true,
		},
		{
			name:    "bucket name with underscore",
			bucket:  CreateBucketRequest{Name: "my_bucket"},
			wantErr: true,
		},
		{
			name:    "bucket name with double dots",
			bucket:  CreateBucketRequest{Name: "my..bucket"},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.bucket.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestUpdateBucketRequest(t *testing.T) {
	policy := "public-read"
	versioning := true

	req := UpdateBucketRequest{
		Policy:     &policy,
		Versioning: &versioning,
	}

	if req.Policy == nil || *req.Policy != "public-read" {
		t.Errorf("Expected policy to be 'public-read', got %v", req.Policy)
	}

	if req.Versioning == nil || *req.Versioning != true {
		t.Errorf("Expected versioning to be true, got %v", req.Versioning)
	}
}
