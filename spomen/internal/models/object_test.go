package models

import (
	"testing"
	"time"
)

func TestObject(t *testing.T) {
	obj := Object{
		Key:          "test/file.txt",
		Size:         1024,
		ContentType:  "text/plain",
		ETag:         "abc123",
		LastModified: time.Now(),
		Metadata:     map[string]string{"author": "test"},
	}

	if obj.Key != "test/file.txt" {
		t.Errorf("Expected key 'test/file.txt', got %s", obj.Key)
	}

	if obj.Size != 1024 {
		t.Errorf("Expected size 1024, got %d", obj.Size)
	}

	if obj.ContentType != "text/plain" {
		t.Errorf("Expected content type 'text/plain', got %s", obj.ContentType)
	}
}

func TestObjectList(t *testing.T) {
	list := ObjectList{
		Objects: []Object{
			{Key: "file1.txt", Size: 100},
			{Key: "file2.txt", Size: 200},
		},
		Prefix:      "data/",
		IsTruncated: false,
	}

	if len(list.Objects) != 2 {
		t.Errorf("Expected 2 objects, got %d", len(list.Objects))
	}

	if list.Prefix != "data/" {
		t.Errorf("Expected prefix 'data/', got %s", list.Prefix)
	}
}

func TestPresignedURLRequest(t *testing.T) {
	tests := []struct {
		name      string
		req       PresignedURLRequest
		wantErr   bool
		errSubstr string
	}{
		{
			name: "valid GET request",
			req: PresignedURLRequest{
				Key:       "file.txt",
				Method:    "GET",
				ExpiresIn: 3600,
			},
			wantErr: false,
		},
		{
			name: "valid PUT request",
			req: PresignedURLRequest{
				Key:       "uploads/new-file.pdf",
				Method:    "PUT",
				ExpiresIn: 600,
			},
			wantErr: false,
		},
		{
			name: "missing key",
			req: PresignedURLRequest{
				Key:    "",
				Method: "GET",
			},
			wantErr:   true,
			errSubstr: "key",
		},
		{
			name: "invalid method",
			req: PresignedURLRequest{
				Key:    "file.txt",
				Method: "DELETE",
			},
			wantErr:   true,
			errSubstr: "method",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.req.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestCopyObjectRequest(t *testing.T) {
	req := CopyObjectRequest{
		SourceBucket: "source-bucket",
		SourceKey:    "original.txt",
		DestKey:      "copy.txt",
	}

	if req.SourceBucket != "source-bucket" {
		t.Errorf("Expected source bucket 'source-bucket', got %s", req.SourceBucket)
	}

	if req.SourceKey != "original.txt" {
		t.Errorf("Expected source key 'original.txt', got %s", req.SourceKey)
	}

	if req.DestKey != "copy.txt" {
		t.Errorf("Expected dest key 'copy.txt', got %s", req.DestKey)
	}
}
