package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/n1xx1n/spomen/internal/models"
)

// =============================================================================
// Bucket Handlers
// =============================================================================

// listBuckets returns all buckets
func (s *Server) listBuckets(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	buckets, err := s.storage.ListBuckets(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"buckets": buckets,
		"count":   len(buckets),
	})
}

// createBucket creates a new bucket
func (s *Server) createBucket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req models.CreateBucketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Name == "" {
		respondError(w, http.StatusBadRequest, "Bucket name is required")
		return
	}

	bucket, err := s.storage.CreateBucket(ctx, req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, bucket)
}

// getBucket returns bucket details
func (s *Server) getBucket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	bucketName := vars["bucket"]

	bucket, err := s.storage.GetBucket(ctx, bucketName)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, bucket)
}

// updateBucket updates bucket settings
func (s *Server) updateBucket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	bucketName := vars["bucket"]

	var req models.UpdateBucketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	bucket, err := s.storage.UpdateBucket(ctx, bucketName, req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, bucket)
}

// deleteBucket deletes a bucket
func (s *Server) deleteBucket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	bucketName := vars["bucket"]

	// Check for force delete
	force := r.URL.Query().Get("force") == "true"

	if err := s.storage.DeleteBucket(ctx, bucketName, force); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Bucket deleted successfully",
		"name":    bucketName,
	})
}
