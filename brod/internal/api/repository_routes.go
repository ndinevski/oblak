package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/oblak/brod/internal/models"
)

// =============================================================================
// Repository handlers (the ECR-shaped half)
// =============================================================================

// listRepositories returns every repository in the registry.
func (s *Server) listRepositories(w http.ResponseWriter, r *http.Request) {
	repos, err := s.registry.ListRepositories(r.Context())
	if err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"repositories":  repos,
		"count":         len(repos),
		"registry_host": s.registry.Host(),
	})
}

// createRepository declares a repository ahead of the first push.
//
// The registry protocol creates a repository implicitly on push, so there is
// nothing to create server-side. This endpoint validates the name and returns
// the URI to push to, which is the useful half of ECR's CreateRepository and
// saves the caller from discovering an invalid name at push time.
func (s *Server) createRepository(w http.ResponseWriter, r *http.Request) {
	var req models.CreateRepositoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Report a conflict if it already holds images, so "create" is not
	// silently a no-op over an existing repository.
	if existing, err := s.registry.GetRepository(r.Context(), req.Name); err == nil && existing.ImageCount > 0 {
		respondError(w, http.StatusConflict, "repository "+req.Name+" already exists")
		return
	}

	repo := models.Repository{
		Name:        req.Name,
		Description: req.Description,
		URI:         s.registry.Host() + "/" + req.Name,
		Exists:      false,
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"repository": repo,
		// Without this the user has to know the registry host and the exact
		// tag syntax to make the repository real.
		"next_step": "docker push " + repo.URI + ":<tag>",
	})
}

// getRepository returns one repository.
func (s *Server) getRepository(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	repo, err := s.registry.GetRepository(r.Context(), name)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, repo)
}

// deleteRepository removes every image in a repository.
func (s *Server) deleteRepository(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	if err := s.registry.DeleteRepository(r.Context(), name); err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"repository": name,
		"deleted":    true,
		// Registry storage is only reclaimed by garbage collection, so saying
		// "deleted" without this would overstate what happened on disk.
		"note": "Manifests are unlinked immediately; disk space is reclaimed when the registry runs garbage collection.",
	})
}

// =============================================================================
// Image handlers
// =============================================================================

// listImages returns every tag in a repository.
func (s *Server) listImages(w http.ResponseWriter, r *http.Request) {
	repository := mux.Vars(r)["name"]

	images, err := s.registry.ListImages(r.Context(), repository)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	var totalSize int64
	for _, img := range images {
		totalSize += img.SizeBytes
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"repository":    repository,
		"images":        images,
		"count":         len(images),
		"total_size":    totalSize,
		"registry_host": s.registry.Host(),
	})
}

// getImage returns one tagged image.
func (s *Server) getImage(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)

	img, err := s.registry.GetImage(r.Context(), vars["name"], vars["tag"])
	if err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"image":     img,
		"reference": img.Reference(s.registry.Host()),
	})
}

// deleteImage removes a tag's manifest.
func (s *Server) deleteImage(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	repository, tag := vars["name"], vars["tag"]

	// Read the image first so the response can name the other tags that went
	// with it: the registry deletes by digest, not by tag.
	img, err := s.registry.GetImage(r.Context(), repository, tag)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	if err := s.registry.DeleteImage(r.Context(), repository, tag); err != nil {
		respondBackendError(w, err)
		return
	}

	body := map[string]interface{}{
		"repository": repository,
		"tag":        tag,
		"digest":     img.Digest,
		"deleted":    true,
	}
	if len(img.SharedTags) > 0 {
		body["also_deleted_tags"] = img.SharedTags
		body["note"] = "These tags shared the deleted manifest digest and were removed with it."
	}

	respondJSON(w, http.StatusOK, body)
}
