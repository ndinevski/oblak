package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/oblak/tefter/internal/engine"
	"github.com/oblak/tefter/internal/models"
)

// =============================================================================
// Instance handlers
// =============================================================================

// listInstances returns every managed database.
func (s *Server) listInstances(w http.ResponseWriter, r *http.Request) {
	instances, err := s.provisioner.ListInstances(r.Context())
	if err != nil {
		respondBackendError(w, err)
		return
	}

	primaries, replicas := 0, 0
	for _, inst := range instances {
		if inst.IsReplica() {
			replicas++
		} else {
			primaries++
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"instances": instances,
		"count":     len(instances),
		"primaries": primaries,
		"replicas":  replicas,
	})
}

// getInstance returns one instance.
func (s *Server) getInstance(w http.ResponseWriter, r *http.Request) {
	inst, err := s.provisioner.GetInstance(r.Context(), mux.Vars(r)["name"])
	if err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"instance":          inst,
		"connection_string": inst.ConnectionString(),
	})
}

// createInstance provisions a new primary.
func (s *Server) createInstance(w http.ResponseWriter, r *http.Request) {
	var req models.CreateInstanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// A generated password is the recommended path: it is long, random and
	// never travels through the caller's own tooling before being set.
	password := req.Password
	generated := false
	if password == "" {
		password = engine.GeneratePassword(24)
		generated = true
	}

	inst, err := s.provisioner.CreateInstance(r.Context(), &req, password)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	body := models.CreateInstanceResponse{
		Instance: inst,
		Note: "This password is shown once and is not recoverable from the API. " +
			"Store it somewhere safe before closing this response.",
	}
	// Only echo a password Tefter generated. Returning one the caller already
	// knows adds nothing and puts it through another log.
	if generated {
		body.Password = password
	} else {
		body.Note = "The password you supplied was used. It is not stored or returned by the API."
	}

	respondJSON(w, http.StatusCreated, body)
}

// deleteInstance removes an instance and its data.
func (s *Server) deleteInstance(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	if err := s.provisioner.DeleteInstance(r.Context(), name); err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"instance": name,
		"deleted":  true,
		// Said plainly, because it is irreversible and the backups are the
		// only remaining copy.
		"note": "The instance and its data volume were removed. Existing backups are unaffected.",
	})
}

// startInstance starts a stopped instance.
func (s *Server) startInstance(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	if err := s.provisioner.StartInstance(r.Context(), name); err != nil {
		respondBackendError(w, err)
		return
	}
	s.respondWithInstance(w, r, name)
}

// stopInstance stops a running instance.
func (s *Server) stopInstance(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	if err := s.provisioner.StopInstance(r.Context(), name); err != nil {
		respondBackendError(w, err)
		return
	}
	s.respondWithInstance(w, r, name)
}

// respondWithInstance re-reads an instance after a lifecycle action, so the
// caller gets the resulting state rather than having to poll for it.
func (s *Server) respondWithInstance(w http.ResponseWriter, r *http.Request, name string) {
	inst, err := s.provisioner.GetInstance(r.Context(), name)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, inst)
}
