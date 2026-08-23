package models

import (
	"strings"
	"testing"
	"time"
)

func TestCreateBackupRequestDefaultsToManual(t *testing.T) {
	req := CreateBackupRequest{}
	if err := req.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Type != BackupTypeManual {
		t.Errorf("expected the type to default to manual, got %q", req.Type)
	}
}

func TestCreateBackupRequestRejectsUnknownType(t *testing.T) {
	req := CreateBackupRequest{Type: "whenever"}
	if err := req.Validate(); err == nil {
		t.Error("expected an unknown backup type to be rejected")
	}
}

func TestRestoreBackupRequestRequiresConfirmation(t *testing.T) {
	// A restore overwrites live data, so naming a backup must not be enough.
	req := RestoreBackupRequest{BackupID: "orders-20260822-120000"}
	err := req.Validate()
	if err == nil {
		t.Fatal("expected a restore without confirmation to be rejected")
	}
	if ve, ok := err.(*ValidationError); !ok || ve.Field != "confirm" {
		t.Errorf("expected a confirm validation error, got %v", err)
	}
}

func TestRestoreBackupRequestValidate(t *testing.T) {
	tests := []struct {
		name    string
		request RestoreBackupRequest
		wantErr bool
		field   string
	}{
		{"valid", RestoreBackupRequest{BackupID: "orders-20260822-120000", Confirm: true}, false, ""},
		{"missing id", RestoreBackupRequest{Confirm: true}, true, "backup_id"},
		// The id becomes part of a filesystem path, so traversal attempts must
		// be rejected rather than sanitised.
		{"path traversal", RestoreBackupRequest{BackupID: "../../etc/passwd", Confirm: true}, true, "backup_id"},
		{"absolute path", RestoreBackupRequest{BackupID: "/etc/passwd", Confirm: true}, true, "backup_id"},
		{"uppercase", RestoreBackupRequest{BackupID: "Orders-123", Confirm: true}, true, "backup_id"},
		{"unconfirmed", RestoreBackupRequest{BackupID: "orders-1"}, true, "confirm"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := tt.request
			err := req.Validate()

			if tt.wantErr {
				if err == nil {
					t.Fatal("expected an error, got none")
				}
				if ve, ok := err.(*ValidationError); ok && ve.Field != tt.field {
					t.Errorf("expected field %q, got %q", tt.field, ve.Field)
				}
				return
			}
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
		})
	}
}

func TestIsValidBackupID(t *testing.T) {
	valid := []string{"orders-20260822-120000", "db1", "a-b-c-1"}
	for _, id := range valid {
		if !IsValidBackupID(id) {
			t.Errorf("expected %q to be valid", id)
		}
	}

	// Anything that could escape the backup directory or confuse a path.
	invalid := []string{"", "../etc", "/abs", "has space", "UPPER", "a/b", "dot.dot", "-leading"}
	for _, id := range invalid {
		if IsValidBackupID(id) {
			t.Errorf("expected %q to be invalid", id)
		}
	}
}

func TestNewBackupIDIsSortableAndValid(t *testing.T) {
	earlier := time.Date(2026, 8, 22, 10, 0, 0, 0, time.UTC)
	later := time.Date(2026, 8, 22, 11, 0, 0, 0, time.UTC)

	a := NewBackupID("orders", earlier)
	b := NewBackupID("orders", later)

	if !strings.HasPrefix(a, "orders-") {
		t.Errorf("expected the id to be prefixed with the instance, got %q", a)
	}
	// Lexical order matching chronological order is what makes a directory
	// listing useful without reading any metadata.
	if !(a < b) {
		t.Errorf("expected ids to sort chronologically: %q should precede %q", a, b)
	}
	// A generated id must survive its own validation on the way back in.
	if !IsValidBackupID(a) {
		t.Errorf("generated id %q fails validation", a)
	}
}

// The id is built from UTC so a server in a non-UTC zone still produces
// chronologically sortable ids.
func TestNewBackupIDUsesUTC(t *testing.T) {
	zone := time.FixedZone("UTC+5", 5*60*60)
	local := time.Date(2026, 8, 22, 15, 0, 0, 0, zone)

	// The trailing suffix is random, so the timestamp is asserted as a prefix.
	if got := NewBackupID("db", local); !strings.HasPrefix(got, "db-20260822-100000-") {
		t.Errorf("expected the id to be normalised to UTC, got %q", got)
	}
}

// Regression: ids used to be the timestamp alone, at one-second resolution.
// A restore takes a pre-restore backup immediately before reading the backup
// it was asked to restore, so the two landed in the same second, the second
// one overwrote the first one's file, and the restore then replayed the very
// state it was meant to undo. Ids must never collide.
func TestNewBackupIDIsUniqueWithinASecond(t *testing.T) {
	at := time.Date(2026, 8, 22, 10, 0, 0, 0, time.UTC)

	seen := make(map[string]bool)
	for i := 0; i < 200; i++ {
		id := NewBackupID("db", at)
		if seen[id] {
			t.Fatalf("duplicate id %q generated for the same instant", id)
		}
		seen[id] = true

		// Ids are used to build a filesystem path, so they must still pass the
		// path-traversal guard.
		if !IsValidBackupID(id) {
			t.Fatalf("generated id %q is not a valid backup id", id)
		}
	}
}

func TestCreateBackupRequestDescription(t *testing.T) {
	req := CreateBackupRequest{Description: "  before schema change  "}
	if err := req.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Description != "before schema change" {
		t.Errorf("expected the description to be trimmed, got %q", req.Description)
	}

	// Bounded so the note cannot be used to write an arbitrarily large file
	// into the backup directory.
	long := CreateBackupRequest{Description: strings.Repeat("x", maxBackupDescription+1)}
	err := long.Validate()
	ve, ok := err.(*ValidationError)
	if !ok || ve.Field != "description" {
		t.Errorf("expected an over-long description to be rejected, got %v", err)
	}
}
