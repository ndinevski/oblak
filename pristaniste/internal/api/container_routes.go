package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/mux"

	"github.com/oblak/pristaniste/internal/models"
)

// =============================================================================
// Container handlers (the ECS-shaped half)
// =============================================================================

// listContainers returns Pristaniste-managed containers.
//
// Only running containers are returned by default, matching `docker ps`.
// Pass ?all=true to include stopped ones.
func (s *Server) listContainers(w http.ResponseWriter, r *http.Request) {
	all := queryBool(r, "all")

	containers, err := s.engine.ListContainers(r.Context(), all)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	running := 0
	for _, c := range containers {
		if c.Status == models.ContainerStatusRunning {
			running++
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"containers": containers,
		"count":      len(containers),
		"running":    running,
	})
}

// getContainer returns one container by id or name.
func (s *Server) getContainer(w http.ResponseWriter, r *http.Request) {
	container, err := s.engine.GetContainer(r.Context(), mux.Vars(r)["id"])
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, container)
}

// createContainer launches a container from an image.
func (s *Server) createContainer(w http.ResponseWriter, r *http.Request) {
	var req models.CreateContainerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	container, err := s.engine.CreateContainer(r.Context(), &req)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, container)
}

// deleteContainer removes a container.
//
// A running container is only removed with ?force=true, so a delete cannot
// silently kill a live workload.
func (s *Server) deleteContainer(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	force := queryBool(r, "force")

	if err := s.engine.RemoveContainer(r.Context(), id, force); err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"id":      id,
		"deleted": true,
	})
}

// startContainer starts a stopped container.
func (s *Server) startContainer(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if err := s.engine.StartContainer(r.Context(), id); err != nil {
		respondBackendError(w, err)
		return
	}
	s.respondWithContainer(w, r, id)
}

// stopContainer stops a running container.
func (s *Server) stopContainer(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	req, ok := decodeActionRequest(w, r)
	if !ok {
		return
	}

	if err := s.engine.StopContainer(r.Context(), id, req.TimeoutSeconds); err != nil {
		respondBackendError(w, err)
		return
	}
	s.respondWithContainer(w, r, id)
}

// restartContainer restarts a container.
func (s *Server) restartContainer(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	req, ok := decodeActionRequest(w, r)
	if !ok {
		return
	}

	if err := s.engine.RestartContainer(r.Context(), id, req.TimeoutSeconds); err != nil {
		respondBackendError(w, err)
		return
	}
	s.respondWithContainer(w, r, id)
}

// containerLogs returns recent output from a container.
func (s *Server) containerLogs(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	opts := models.LogOptions{
		Tail:       queryInt(r, "tail", 100),
		Timestamps: true,
	}
	// Cap the tail so one request cannot ask the engine for an entire log.
	if opts.Tail > 5000 {
		opts.Tail = 5000
	}
	if since := r.URL.Query().Get("since"); since != "" {
		if t, err := time.Parse(time.RFC3339, since); err == nil {
			opts.Since = t
		}
	}

	entries, err := s.engine.ContainerLogs(r.Context(), id, opts)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"container_id": id,
		"entries":      entries,
		"count":        len(entries),
	})
}

// containerStats returns a resource sample for a container.
func (s *Server) containerStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.engine.ContainerStats(r.Context(), mux.Vars(r)["id"])
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, stats)
}

// =============================================================================
// Helpers
// =============================================================================

// respondWithContainer re-reads a container after a lifecycle action, so the
// caller gets the resulting state rather than having to poll for it.
func (s *Server) respondWithContainer(w http.ResponseWriter, r *http.Request, id string) {
	container, err := s.engine.GetContainer(r.Context(), id)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, container)
}

// decodeActionRequest reads optional action options from the body.
//
// Lifecycle actions are commonly called with no body at all, so an empty body
// is valid and yields defaults; only malformed JSON is an error.
func decodeActionRequest(w http.ResponseWriter, r *http.Request) (models.ContainerActionRequest, bool) {
	var req models.ContainerActionRequest

	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid request body")
			return req, false
		}
	}

	if err := req.Validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return req, false
	}

	return req, true
}
