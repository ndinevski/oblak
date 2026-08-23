package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/mux"

	"github.com/oblak/tefter/internal/models"
)

// =============================================================================
// Backup handlers
// =============================================================================

// listBackups returns every backup, newest first.
func (s *Server) listBackups(w http.ResponseWriter, r *http.Request) {
	// An optional filter, so one endpoint serves both the global list and a
	// query scoped to an instance.
	instance := r.URL.Query().Get("instance")

	backups, err := s.provisioner.ListBackups(r.Context(), instance)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondWithBackups(w, backups, instance)
}

// listInstanceBackups returns the backups of one instance.
func (s *Server) listInstanceBackups(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	// Resolve the instance first so a typo returns 404 rather than an empty
	// list that looks like "no backups yet".
	if _, err := s.provisioner.GetInstance(r.Context(), name); err != nil {
		respondBackendError(w, err)
		return
	}

	backups, err := s.provisioner.ListBackups(r.Context(), name)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondWithBackups(w, backups, name)
}

func respondWithBackups(w http.ResponseWriter, backups []models.Backup, instance string) {
	var totalSize int64
	for _, b := range backups {
		totalSize += b.SizeBytes
	}

	body := map[string]interface{}{
		"backups":    backups,
		"count":      len(backups),
		"total_size": totalSize,
	}
	if instance != "" {
		body["instance"] = instance
	}
	respondJSON(w, http.StatusOK, body)
}

// getBackup returns one backup.
func (s *Server) getBackup(w http.ResponseWriter, r *http.Request) {
	backup, err := s.provisioner.GetBackup(r.Context(), mux.Vars(r)["id"])
	if err != nil {
		respondBackendError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, backup)
}

// createBackup takes a backup of an instance.
func (s *Server) createBackup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	name := mux.Vars(r)["name"]

	var req models.CreateBackupRequest
	// An empty body is normal here, so only malformed JSON is an error.
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid request body")
			return
		}
	}
	if err := req.Validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	inst, err := s.provisioner.GetInstance(ctx, name)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	backup, err := s.provisioner.CreateBackup(ctx, inst, &req)
	if err != nil {
		// A failed backup still produces a record, and returning it tells the
		// caller why rather than just that something went wrong.
		if backup != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"error":  err.Error(),
				"backup": backup,
			})
			return
		}
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, backup)
}

// deleteBackup removes a backup.
func (s *Server) deleteBackup(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if err := s.provisioner.DeleteBackup(r.Context(), id); err != nil {
		respondBackendError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"backup_id": id,
		"deleted":   true,
	})
}

// restoreBackup loads a backup into an instance.
func (s *Server) restoreBackup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req models.RestoreBackupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	backup, err := s.provisioner.GetBackup(ctx, req.BackupID)
	if err != nil {
		respondBackendError(w, err)
		return
	}
	// Restoring from a failed dump would overwrite a working database with
	// nothing.
	if backup.Status != models.BackupStatusAvailable {
		respondError(w, http.StatusConflict,
			"backup "+backup.ID+" is not available to restore (status: "+string(backup.Status)+")")
		return
	}

	// Restoring into the instance the backup came from is the common case, so
	// the target defaults to it.
	targetName := req.TargetInstance
	if targetName == "" {
		targetName = backup.Instance
	}

	target, err := s.provisioner.GetInstance(ctx, targetName)
	if err != nil {
		respondBackendError(w, err)
		return
	}

	// Guard against restoring a backup into an instance it did not come from.
	// This is exactly the reused-name trap: delete an instance, create a new
	// one with the same name, and a name-only check would happily overwrite the
	// new database with the old one's data. Compare identity, and require an
	// explicit opt-in to cross it. A legacy backup with no recorded identity
	// falls back to the name it carries, preserving the old behaviour for data
	// taken before identities existed.
	crossesIdentity := false
	if backup.InstanceUID != "" && target.UID != "" {
		crossesIdentity = backup.InstanceUID != target.UID
	} else {
		crossesIdentity = backup.Instance != target.Name
	}
	if crossesIdentity && !req.AllowDifferentInstance {
		respondJSON(w, http.StatusConflict, map[string]interface{}{
			"error": "backup " + backup.ID + " was taken from a different instance" +
				" than " + target.Name + " (likely an earlier instance that reused this name);" +
				" restoring it would overwrite " + target.Name + " with unrelated data",
			"hint": "set allow_different_instance to true to restore it anyway",
		})
		return
	}

	started := time.Now()
	result := models.RestoreResult{
		BackupID:       backup.ID,
		TargetInstance: target.Name,
	}

	// A restore overwrites live data, so unless explicitly waived a safety
	// backup is taken first. It is the only route back from a wrong restore.
	if !req.SkipPreRestoreBackup {
		safety, err := s.provisioner.CreateBackup(ctx, target, &models.CreateBackupRequest{
			Type:        models.BackupTypePreRestore,
			Description: "taken automatically before restoring " + backup.ID,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"error": "could not take a pre-restore backup, so the restore was not attempted: " + err.Error(),
				"hint":  "set skip_pre_restore_backup to true to restore anyway",
			})
			return
		}
		result.PreRestoreBackupID = safety.ID
	}

	if err := s.provisioner.RestoreBackup(ctx, backup, target); err != nil {
		body := map[string]interface{}{"error": err.Error()}
		if result.PreRestoreBackupID != "" {
			// Naming it here means the operator does not have to go looking
			// for the way back at the worst possible moment.
			body["pre_restore_backup_id"] = result.PreRestoreBackupID
			body["hint"] = "the target may be in a partial state; restore the pre-restore backup to roll back"
		}
		respondJSON(w, http.StatusInternalServerError, body)
		return
	}

	result.Restored = true
	result.DurationSeconds = time.Since(started).Seconds()
	respondJSON(w, http.StatusOK, result)
}
