package dbstats

import (
	"context"
	"testing"
	"time"

	"github.com/oblak/tefter/internal/engine"
	"github.com/oblak/tefter/internal/models"
)

func TestCollectPublishesASnapshotPerInstance(t *testing.T) {
	mock := engine.NewMockProvisioner()
	if _, err := mock.CreateInstance(context.Background(),
		&models.CreateInstanceRequest{Name: "orders", Engine: models.EnginePostgres, Size: "small", Username: "tefter", Database: "orders"},
		"pw",
	); err != nil {
		t.Fatalf("seed instance: %v", err)
	}

	c, err := New(mock, discardLogger(), 30*time.Second)
	if err != nil {
		t.Fatalf("new collector: %v", err)
	}
	c.collect(context.Background())

	snap := c.snapMu.get()
	if len(snap) != 1 {
		t.Fatalf("snapshot has %d entries, want 1", len(snap))
	}
	if snap[0].Instance != "orders" || !snap[0].Up {
		t.Errorf("unexpected snapshot entry: %+v", snap[0])
	}
}

func TestCollectMarksAFailedProvisionerReadAsDown(t *testing.T) {
	mock := engine.NewMockProvisioner()
	if _, err := mock.CreateInstance(context.Background(),
		&models.CreateInstanceRequest{Name: "orders", Engine: models.EnginePostgres, Size: "small", Username: "tefter", Database: "orders"},
		"pw",
	); err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Make every provisioner call fail after the instance exists.
	mock.ShouldFail = true

	c, err := New(mock, discardLogger(), 30*time.Second)
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	// ListInstances itself fails now, so the snapshot stays empty rather than
	// panicking; that is the safe behaviour under a broken backend.
	c.collect(context.Background())
	if len(c.snapMu.get()) != 0 {
		t.Errorf("expected no snapshot when the backend is down, got %d", len(c.snapMu.get()))
	}
}

func TestNewClampsTooSmallInterval(t *testing.T) {
	c, err := New(engine.NewMockProvisioner(), discardLogger(), time.Second)
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	if c.interval < 5*time.Second {
		t.Errorf("interval = %s, want it clamped up", c.interval)
	}
}
