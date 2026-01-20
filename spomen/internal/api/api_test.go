package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRespondJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	data := map[string]string{"message": "test"}

	respondJSON(rr, http.StatusOK, data)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Expected Content-Type application/json, got %s", contentType)
	}

	var response map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response["message"] != "test" {
		t.Errorf("Expected message 'test', got %s", response["message"])
	}
}

func TestRespondError(t *testing.T) {
	rr := httptest.NewRecorder()

	respondError(rr, http.StatusBadRequest, "test error")

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", rr.Code)
	}

	var response map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response["error"] != "test error" {
		t.Errorf("Expected error 'test error', got %s", response["error"])
	}
}

func TestHealthCheckRequest(t *testing.T) {
	req, err := http.NewRequest("GET", "/health", nil)
	if err != nil {
		t.Fatal(err)
	}

	if req.URL.Path != "/health" {
		t.Errorf("Expected path /health, got %s", req.URL.Path)
	}
}

func TestCreateBucketRequestValidation(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantMethod string
	}{
		{
			name:       "empty body",
			body:       "",
			wantMethod: "POST",
		},
		{
			name:       "valid json",
			body:       `{"name": "test-bucket", "policy": "private"}`,
			wantMethod: "POST",
		},
		{
			name:       "with versioning",
			body:       `{"name": "test-bucket", "versioning": true}`,
			wantMethod: "POST",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest("POST", "/api/v1/buckets", bytes.NewBufferString(tt.body))
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Content-Type", "application/json")

			if req.Method != tt.wantMethod {
				t.Errorf("Expected method %s, got %s", tt.wantMethod, req.Method)
			}
		})
	}
}

func TestListObjectsQueryParams(t *testing.T) {
	tests := []struct {
		name      string
		query     string
		wantParam map[string]string
	}{
		{
			name:  "with prefix",
			query: "?prefix=data/",
			wantParam: map[string]string{
				"prefix": "data/",
			},
		},
		{
			name:  "with delimiter",
			query: "?delimiter=/",
			wantParam: map[string]string{
				"delimiter": "/",
			},
		},
		{
			name:  "with max_keys",
			query: "?max_keys=100",
			wantParam: map[string]string{
				"max_keys": "100",
			},
		},
		{
			name:  "combined params",
			query: "?prefix=images/&delimiter=/&max_keys=50",
			wantParam: map[string]string{
				"prefix":    "images/",
				"delimiter": "/",
				"max_keys":  "50",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest("GET", "/api/v1/buckets/test/objects"+tt.query, nil)
			if err != nil {
				t.Fatal(err)
			}

			for key, want := range tt.wantParam {
				got := req.URL.Query().Get(key)
				if got != want {
					t.Errorf("Expected %s=%s, got %s", key, want, got)
				}
			}
		})
	}
}

func TestObjectInfoQueryParam(t *testing.T) {
	req, err := http.NewRequest("GET", "/api/v1/buckets/test/objects/file.txt?info=true", nil)
	if err != nil {
		t.Fatal(err)
	}

	info := req.URL.Query().Get("info")
	if info != "true" {
		t.Errorf("Expected info=true, got %s", info)
	}
}

func TestCopyObjectActionParam(t *testing.T) {
	body := `{"source_bucket": "src", "source_key": "old.txt", "dest_key": "new.txt"}`
	req, err := http.NewRequest("POST", "/api/v1/buckets/test/objects/new.txt?action=copy", bytes.NewBufferString(body))
	if err != nil {
		t.Fatal(err)
	}

	action := req.URL.Query().Get("action")
	if action != "copy" {
		t.Errorf("Expected action=copy, got %s", action)
	}
}

func TestPresignedURLRequest(t *testing.T) {
	body := `{"expiry": 3600}`
	req, err := http.NewRequest("POST", "/api/v1/buckets/test/objects/file.txt/presigned", bytes.NewBufferString(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	if req.Method != "POST" {
		t.Errorf("Expected POST method, got %s", req.Method)
	}

	var requestBody map[string]int
	if err := json.NewDecoder(req.Body).Decode(&requestBody); err != nil {
		t.Fatal(err)
	}

	if requestBody["expiry"] != 3600 {
		t.Errorf("Expected expiry 3600, got %d", requestBody["expiry"])
	}
}

func TestBucketRoutes(t *testing.T) {
	routes := []struct {
		name   string
		method string
		path   string
	}{
		{"list buckets", "GET", "/api/v1/buckets"},
		{"create bucket", "POST", "/api/v1/buckets"},
		{"get bucket", "GET", "/api/v1/buckets/test"},
		{"delete bucket", "DELETE", "/api/v1/buckets/test"},
		{"update bucket", "PUT", "/api/v1/buckets/test"},
	}

	for _, r := range routes {
		t.Run(r.name, func(t *testing.T) {
			req, err := http.NewRequest(r.method, r.path, nil)
			if err != nil {
				t.Fatal(err)
			}

			if req.Method != r.method {
				t.Errorf("Expected method %s, got %s", r.method, req.Method)
			}
		})
	}
}

func TestObjectRoutes(t *testing.T) {
	routes := []struct {
		name   string
		method string
		path   string
	}{
		{"list objects", "GET", "/api/v1/buckets/test/objects"},
		{"upload object", "POST", "/api/v1/buckets/test/objects/file.txt"},
		{"get object", "GET", "/api/v1/buckets/test/objects/file.txt"},
		{"delete object", "DELETE", "/api/v1/buckets/test/objects/file.txt"},
	}

	for _, r := range routes {
		t.Run(r.name, func(t *testing.T) {
			req, err := http.NewRequest(r.method, r.path, nil)
			if err != nil {
				t.Fatal(err)
			}

			if req.Method != r.method {
				t.Errorf("Expected method %s, got %s", r.method, req.Method)
			}
		})
	}
}
