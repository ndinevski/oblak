package models

import (
	"fmt"
	"regexp"
	"time"
)

// Backup is a point-in-time export of one queue (its config and current
// messages). Like the other Oblak services, backups are portable JSON exports
// that outlive the queue they came from.
type Backup struct {
	ID           string `json:"id"`
	Queue        string `json:"queue"`
	MessageCount int64  `json:"message_count"`
	SizeBytes    int64  `json:"size_bytes"`
	CreatedAt    string `json:"created_at"`
}

var backupIDRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$`)

// IsValidBackupID reports whether an id is safe to use in a path.
func IsValidBackupID(id string) bool { return backupIDRe.MatchString(id) }

// NewBackupID builds a sortable, unique backup id.
func NewBackupID(queue string, at time.Time) string {
	return fmt.Sprintf("%s-%s-%s", queue, at.UTC().Format("20060102-150405"), randomHex(2))
}

// RestoreBackupRequest restores a backup into a queue.
type RestoreBackupRequest struct {
	BackupID    string `json:"backup_id"`
	TargetQueue string `json:"target_queue,omitempty"`
	Confirm     bool   `json:"confirm"`
}

// Validate checks the restore request.
func (r *RestoreBackupRequest) Validate() error {
	if r.BackupID == "" {
		return &ValidationError{Field: "backup_id", Message: "backup_id is required"}
	}
	if !IsValidBackupID(r.BackupID) {
		return &ValidationError{Field: "backup_id", Message: "malformed backup id"}
	}
	if !r.Confirm {
		return &ValidationError{Field: "confirm", Message: "a restore overwrites the target queue; set confirm to true to proceed"}
	}
	return nil
}

// BackupFile is the on-disk shape of a backup.
type BackupFile struct {
	Backup   Backup    `json:"backup"`
	Queue    Queue     `json:"queue"`
	Messages []Message `json:"messages"`
}
