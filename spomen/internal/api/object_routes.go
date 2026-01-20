package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/n1xx1n/spomen/internal/models"
)

// =============================================================================
// Object Handlers
// =============================================================================

// handleObject is a unified handler that dispatches based on method and query params
func (s *Server) handleObject(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// Check if info query param is set
		if r.URL.Query().Get("info") == "true" {
			s.getObjectInfo(w, r)
		} else {
			s.getObject(w, r)
		}
	case http.MethodPut:
		s.putObject(w, r)
	case http.MethodDelete:
		s.deleteObject(w, r)
	case http.MethodPost:
		// Check action query param
		action := r.URL.Query().Get("action")
		if action == "copy" {
			s.copyObject(w, r)
		} else {
			respondError(w, http.StatusBadRequest, "Unknown action. Use ?action=copy")
		}
	default:
		respondError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// listObjects lists objects in a bucket
func (s *Server) listObjects(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	bucketName := vars["bucket"]

	// Query params
	prefix := r.URL.Query().Get("prefix")
	delimiter := r.URL.Query().Get("delimiter")
	marker := r.URL.Query().Get("marker")
	maxKeysStr := r.URL.Query().Get("max_keys")

	maxKeys := 1000
	if maxKeysStr != "" {
		if mk, err := strconv.Atoi(maxKeysStr); err == nil {
			maxKeys = mk
		}
	}

	objects, err := s.storage.ListObjects(ctx, bucketName, prefix, delimiter, maxKeys, marker)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, objects)
}

// getObject downloads an object
func (s *Server) getObject(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	bucketName := vars["bucket"]
	key := vars["key"]

	reader, meta, err := s.storage.GetObject(ctx, bucketName, key)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	defer reader.Close()

	// Set headers
	w.Header().Set("Content-Type", meta.ContentType)
	w.Header().Set("Content-Length", strconv.FormatInt(meta.Size, 10))
	w.Header().Set("ETag", meta.ETag)
	w.Header().Set("Last-Modified", meta.LastModified.Format(http.TimeFormat))

	if meta.VersionID != "" {
		w.Header().Set("X-Version-Id", meta.VersionID)
	}

	// Set custom metadata headers
	for k, v := range meta.Metadata {
		w.Header().Set("X-Meta-"+k, v)
	}

	io.Copy(w, reader)
}

// getObjectInfo returns object metadata
func (s *Server) getObjectInfo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	bucketName := vars["bucket"]
	key := vars["key"]

	meta, err := s.storage.GetObjectInfo(ctx, bucketName, key)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, meta)
}

// putObject uploads an object
func (s *Server) putObject(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	bucketName := vars["bucket"]
	key := vars["key"]

	// Get content type
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Get content length
	contentLength := r.ContentLength

	// Extract custom metadata from headers
	metadata := make(map[string]string)
	for name, values := range r.Header {
		if len(name) > 7 && name[:7] == "X-Meta-" {
			metadata[name[7:]] = values[0]
		}
	}

	obj, err := s.storage.PutObject(ctx, bucketName, key, r.Body, contentLength, contentType, metadata)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, obj)
}

// deleteObject deletes an object
func (s *Server) deleteObject(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	bucketName := vars["bucket"]
	key := vars["key"]

	if err := s.storage.DeleteObject(ctx, bucketName, key); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Object deleted successfully",
		"key":     key,
	})
}

// deleteObjects deletes multiple objects
func (s *Server) deleteObjects(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	bucketName := vars["bucket"]

	var req struct {
		Keys []string `json:"keys"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.Keys) == 0 {
		respondError(w, http.StatusBadRequest, "No keys provided")
		return
	}

	deleted, errors := s.storage.DeleteObjects(ctx, bucketName, req.Keys)

	errorMessages := make([]string, 0, len(errors))
	for _, err := range errors {
		errorMessages = append(errorMessages, err.Error())
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"deleted": deleted,
		"errors":  errorMessages,
	})
}

// copyObject copies an object
func (s *Server) copyObject(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	bucketName := vars["bucket"]
	key := vars["key"]

	var req models.CopyObjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Default source key is the current key if copying within same bucket
	if req.SourceKey == "" {
		req.SourceKey = key
	}
	if req.SourceBucket == "" {
		req.SourceBucket = bucketName
	}
	if req.DestKey == "" {
		respondError(w, http.StatusBadRequest, "Destination key is required")
		return
	}

	obj, err := s.storage.CopyObject(ctx, bucketName, req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, obj)
}

// getPresignedURL generates a presigned URL
func (s *Server) getPresignedURL(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	bucketName := vars["bucket"]

	var req models.PresignedURLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Key == "" {
		respondError(w, http.StatusBadRequest, "Key is required")
		return
	}
	if req.Method == "" {
		req.Method = "GET"
	}
	if req.ExpiresIn == 0 {
		req.ExpiresIn = 3600 // 1 hour default
	}

	url, err := s.storage.GetPresignedURL(ctx, bucketName, req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, url)
}
