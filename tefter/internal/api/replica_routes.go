package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/oblak/tefter/internal/models"
)

// =============================================================================
// Replication handlers
// =============================================================================

// listReplicas returns the replicas following an instance, each with its
// current lag.
func (s *Server) listReplicas(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	name := mux.Vars(r)["name"]

	primary, err := s.provisioner.GetInstance(ctx, name)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	type replicaView struct {
		Instance    *models.DBInstance        `json:"instance"`
		Replication *models.ReplicationStatus `json:"replication,omitempty"`
	}

	views := make([]replicaView, 0, len(primary.Replicas))
	for _, replicaName := range primary.Replicas {
		replica, err := s.provisioner.GetInstance(ctx, replicaName)
		if err != nil {
			continue
		}
		view := replicaView{Instance: replica}
		// Lag is only meaningful on a running replica, and querying a stopped
		// one would just produce a connection error.
		if replica.Status == models.InstanceStatusAvailable {
			if status, err := s.provisioner.ReplicationStatus(ctx, replica); err == nil {
				view.Replication = status
			}
		}
		views = append(views, view)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"primary":  primary.Name,
		"replicas": views,
		"count":    len(views),
	})
}

// createReplica provisions a read replica of an instance.
func (s *Server) createReplica(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sourceName := mux.Vars(r)["name"]

	var req models.CreateReplicaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	// The source comes from the path; a body that disagrees is ignored rather
	// than being allowed to redirect the request somewhere else.
	req.SourceInstance = sourceName

	if err := req.Validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	primary, err := s.provisioner.GetInstance(ctx, sourceName)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	replica, err := s.provisioner.CreateReplica(ctx, &req, primary)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	body := map[string]interface{}{
		"replica":           replica,
		"source_instance":   primary.Name,
		"connection_string": replica.ConnectionString(),
		// The credentials come from the primary, and saying so avoids a
		// support question about a password that was never issued.
		"note": "A read replica accepts the same credentials as its primary and rejects writes.",
	}

	respondJSON(w, http.StatusCreated, body)
}

// replicationStatus reports how far behind a replica is.
func (s *Server) replicationStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	name := mux.Vars(r)["name"]

	inst, err := s.provisioner.GetInstance(ctx, name)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	// Asked of a primary, report its replicas rather than an error: that is
	// almost always what the caller wanted to know.
	if !inst.IsReplica() {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"instance": inst.Name,
			"role":     inst.Role,
			"replicas": inst.Replicas,
			"note":     "This instance is a primary. Query a replica for its lag.",
		})
		return
	}

	if inst.Status != models.InstanceStatusAvailable {
		respondJSON(w, http.StatusOK, &models.ReplicationStatus{
			Instance:       inst.Name,
			SourceInstance: inst.SourceInstance,
			State:          models.ReplicationStopped,
			Detail:         "the replica is not running",
		})
		return
	}

	status, err := s.provisioner.ReplicationStatus(ctx, inst)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, status)
}

// promoteReplica turns a read replica into a standalone primary.
func (s *Server) promoteReplica(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	name := mux.Vars(r)["name"]

	inst, err := s.provisioner.GetInstance(ctx, name)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	if err := s.provisioner.PromoteReplica(ctx, inst); err != nil {
		respondBackendError(w, err)
		return
	}

	promoted, err := s.provisioner.GetInstance(ctx, name)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"instance": promoted,
		"promoted": true,
		// Promotion cannot be undone by pointing the instance back at its old
		// primary: the two have diverged from the moment writes are accepted.
		"note": "Promotion is one-way. This instance now accepts writes and no longer follows " +
			"its former primary; to replicate again, create a new replica.",
	})
}
