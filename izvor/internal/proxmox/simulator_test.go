package proxmox

import (
	"context"
	"testing"

	"github.com/oblak/izvor/internal/models"
)

// The simulator must let a VM be created, powered on and off, snapshotted and
// deleted entirely in memory, so the dashboard works with no Proxmox.
func TestSimulatorLifecycle(t *testing.T) {
	sim := NewSimulator()
	ctx := context.Background()

	if err := sim.HealthCheck(ctx); err != nil {
		t.Fatalf("simulator should be healthy: %v", err)
	}

	// Starts empty: only user-created VMs should ever appear.
	vms, err := sim.ListVMs(ctx, "")
	if err != nil {
		t.Fatalf("ListVMs: %v", err)
	}
	if len(vms) != 0 {
		t.Fatalf("expected no seeded VMs, got %d", len(vms))
	}

	// Create from a template with no explicit os_type.
	vm, vmid, err := sim.CreateVM(ctx, &models.CreateVMRequest{
		Name:     "sim-test",
		Template: "ubuntu-22.04",
		Size:     "small",
	})
	if err != nil {
		t.Fatalf("CreateVM: %v", err)
	}
	if vmid == "" || vm.ID != vmid {
		t.Fatalf("expected a vmid, got id=%q vmid=%q", vm.ID, vmid)
	}
	if vm.OSType != models.OSTypeLinux {
		t.Errorf("expected os type to default to linux, got %q", vm.OSType)
	}
	if vm.IPAddress == "" || vm.MACAddress == "" {
		t.Errorf("expected an IP and MAC to be assigned, got ip=%q mac=%q", vm.IPAddress, vm.MACAddress)
	}
	if vm.Status != models.VMStatusStopped {
		t.Errorf("expected new VM to be stopped, got %q", vm.Status)
	}

	// Power on: running with live stats.
	if _, err := sim.StartVM(ctx, vm.Node, vmid); err != nil {
		t.Fatalf("StartVM: %v", err)
	}
	got, _ := sim.GetVM(ctx, "", vmid)
	if got.Status != models.VMStatusRunning {
		t.Errorf("expected running after start, got %q", got.Status)
	}
	if got.Uptime == 0 || got.MemoryUsed == 0 {
		t.Errorf("expected live stats when running, got uptime=%d mem=%d", got.Uptime, got.MemoryUsed)
	}

	// Power off: stats cleared.
	if _, err := sim.StopVM(ctx, vm.Node, vmid, false); err != nil {
		t.Fatalf("StopVM: %v", err)
	}
	got, _ = sim.GetVM(ctx, "", vmid)
	if got.Status != models.VMStatusStopped || got.Uptime != 0 {
		t.Errorf("expected stopped with no uptime, got status=%q uptime=%d", got.Status, got.Uptime)
	}

	// Snapshot round-trip.
	if _, err := sim.CreateSnapshot(ctx, vm.Node, vmid, &models.CreateSnapshotRequest{Name: "snap1"}); err != nil {
		t.Fatalf("CreateSnapshot: %v", err)
	}
	snaps, _ := sim.ListSnapshots(ctx, vm.Node, vmid)
	if len(snaps) != 1 || snaps[0].Name != "snap1" {
		t.Fatalf("expected one snapshot named snap1, got %+v", snaps)
	}

	// Delete: gone.
	if err := sim.DeleteVM(ctx, vm.Node, vmid); err != nil {
		t.Fatalf("DeleteVM: %v", err)
	}
	if _, err := sim.GetVM(ctx, "", vmid); err == nil {
		t.Errorf("expected VM to be gone after delete")
	}
}
