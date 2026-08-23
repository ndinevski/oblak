package models

import (
	"crypto/rand"
	"fmt"
	"regexp"
	"time"
)

// Backup is a point-in-time export of one table (its schema and every item).
//
// Like Tefter's backups, an Indeks backup is a portable logical export rather
// than a filesystem snapshot: it is a single JSON file that can be restored into
// a table of the same name, and it outlives the table it came from.
type Backup struct {
	ID        string `json:"id"`
	Table     string `json:"table"`
	ItemCount int64  `json:"item_count"`
	SizeBytes int64  `json:"size_bytes"`
	CreatedAt string `json:"created_at"`
}

// backupIDRe guards the id, which is used to build a filesystem path.
var backupIDRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$`)

// IsValidBackupID reports whether an id is safe to use in a path.
func IsValidBackupID(id string) bool { return backupIDRe.MatchString(id) }

// NewBackupID builds a sortable, unique id: table name, UTC timestamp, and a
// random suffix so two backups of one table in the same second cannot collide.
func NewBackupID(table string, at time.Time) string {
	return fmt.Sprintf("%s-%s-%s", table, at.UTC().Format("20060102-150405"), randomSuffix())
}

func randomSuffix() string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		panic("indeks: cannot read random bytes for a backup id: " + err.Error())
	}
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

// RestoreBackupRequest asks to restore a backup into a table.
type RestoreBackupRequest struct {
	BackupID string `json:"backup_id"`

	// TargetTable is where to restore. Empty restores into the table the backup
	// came from.
	TargetTable string `json:"target_table,omitempty"`

	// Confirm must be true: a restore overwrites the target table's contents.
	Confirm bool `json:"confirm"`
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
		return &ValidationError{
			Field:   "confirm",
			Message: "a restore overwrites the target table; set confirm to true to proceed",
		}
	}
	return nil
}

// BackupFile is the on-disk shape of a backup: enough to recreate the table and
// repopulate it.
type BackupFile struct {
	Backup Backup    `json:"backup"`
	Keys   KeySchema `json:"keys"`
	Items  []Item    `json:"items"`
}
