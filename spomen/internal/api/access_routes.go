package api

import (
	"encoding/json"
	"net/http"

	"github.com/n1xx1n/spomen/internal/models"
)

// issueCredentials creates per-user scoped credentials for MinIO/S3 access.
func (s *Server) issueCredentials(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req models.IssueCredentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.UserID <= 0 {
		respondError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	if len(req.Buckets) == 0 {
		respondError(w, http.StatusBadRequest, "At least one bucket is required")
		return
	}

	credentials, err := s.storage.IssueScopedCredentials(ctx, req)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, credentials)
}
