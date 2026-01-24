package proxmox

import (
	"context"
	"testing"
	"time"

	"github.com/oblak/izvor/internal/models"
)

func TestNewMockClient(t *testing.T) {
	client := NewMockClient()

	if client == nil {
		t.Fatal("NewMockClient returned nil")
	}

	// Check that default test data is present
	ctx := context.Background()
	nodes, err := client.ListNodes(ctx)
	if err != nil {
		t.Fatalf("ListNodes failed: %v", err)
	}

	if len(nodes) < 2 {
		t.Errorf("Expected at least 2 nodes, got %d", len(nodes))
	}
}

func TestMockClientHealthCheck(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	// Should succeed by default
	err := client.HealthCheck(ctx)
	if err != nil {
		t.Errorf("HealthCheck failed: %v", err)
	}

	// Should fail when error is set
	client.SetError(true, "connection refused")
	err = client.HealthCheck(ctx)
	if err == nil {
		t.Error("Expected error but got nil")
	}
}

func TestMockClientGetVersion(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	version, err := client.GetVersion(ctx)
	if err != nil {
		t.Fatalf("GetVersion failed: %v", err)
	}

	if version != "8.0.4" {
		t.Errorf("Expected version '8.0.4', got '%s'", version)
	}
}

func TestMockClientGetDefaultNode(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	node, err := client.GetDefaultNode(ctx)
	if err != nil {
		t.Fatalf("GetDefaultNode failed: %v", err)
	}

	if node == "" {
		t.Error("Expected a node name, got empty string")
	}
}

func TestMockClientListNodes(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	nodes, err := client.ListNodes(ctx)
	if err != nil {
		t.Fatalf("ListNodes failed: %v", err)
	}

	if len(nodes) == 0 {
		t.Error("Expected nodes, got empty list")
	}

	// Check first node properties
	foundOnline := false
	for _, node := range nodes {
		if node.Status == "online" {
			foundOnline = true
		}
	}
	if !foundOnline {
		t.Error("Expected at least one online node")
	}
}

func TestMockClientListVMs(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	// List all VMs
	vms, err := client.ListVMs(ctx, "")
	if err != nil {
		t.Fatalf("ListVMs failed: %v", err)
	}

	if len(vms) == 0 {
		t.Error("Expected VMs, got empty list")
	}

	// List VMs by node
	vms, err = client.ListVMs(ctx, "pve-node1")
	if err != nil {
		t.Fatalf("ListVMs by node failed: %v", err)
	}

	for _, vm := range vms {
		if vm.Node != "pve-node1" {
			t.Errorf("Expected VM on pve-node1, got %s", vm.Node)
		}
	}
}

func TestMockClientGetVM(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	vm, err := client.GetVM(ctx, "", "100")
	if err != nil {
		t.Fatalf("GetVM failed: %v", err)
	}

	if vm.ID != "100" {
		t.Errorf("Expected VM ID '100', got '%s'", vm.ID)
	}

	if vm.Name != "test-web-server" {
		t.Errorf("Expected VM name 'test-web-server', got '%s'", vm.Name)
	}

	// Test not found
	_, err = client.GetVM(ctx, "", "99999")
	if err == nil {
		t.Error("Expected error for non-existent VM")
	}
}

func TestMockClientCreateVM(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	req := &models.CreateVMRequest{
		Name:     "new-test-vm",
		Template: "ubuntu-22.04",
		Size:     "small",
	}
	req.ApplySize()

	vm, vmid, err := client.CreateVM(ctx, req)
	if err != nil {
		t.Fatalf("CreateVM failed: %v", err)
	}

	if vm == nil {
		t.Fatal("CreateVM returned nil VM")
	}

	if vmid == "" {
		t.Error("CreateVM returned empty VMID")
	}

	if vm.Name != "new-test-vm" {
		t.Errorf("Expected VM name 'new-test-vm', got '%s'", vm.Name)
	}

	// Verify VM was added
	retrievedVM, err := client.GetVM(ctx, "", vmid)
	if err != nil {
		t.Fatalf("Failed to get created VM: %v", err)
	}

	if retrievedVM.Name != "new-test-vm" {
		t.Errorf("Retrieved VM has wrong name")
	}
}

func TestMockClientCreateVMWithStartOnCreate(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	req := &models.CreateVMRequest{
		Name:          "autostart-vm",
		Template:      "ubuntu-22.04",
		Size:          "micro",
		StartOnCreate: true,
	}
	req.ApplySize()

	vm, _, err := client.CreateVM(ctx, req)
	if err != nil {
		t.Fatalf("CreateVM failed: %v", err)
	}

	if vm.Status != models.VMStatusRunning {
		t.Errorf("Expected VM status 'running', got '%s'", vm.Status)
	}
}

func TestMockClientDeleteVM(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	// Delete existing VM
	err := client.DeleteVM(ctx, "", "102")
	if err != nil {
		t.Fatalf("DeleteVM failed: %v", err)
	}

	// Verify VM was deleted
	_, err = client.GetVM(ctx, "", "102")
	if err == nil {
		t.Error("Expected error for deleted VM")
	}

	// Try to delete non-existent VM
	err = client.DeleteVM(ctx, "", "99999")
	if err == nil {
		t.Error("Expected error for non-existent VM")
	}
}

func TestMockClientVMPowerOperations(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	// Start VM
	upid, err := client.StartVM(ctx, "pve-node2", "102")
	if err != nil {
		t.Fatalf("StartVM failed: %v", err)
	}
	if upid == "" {
		t.Error("StartVM returned empty UPID")
	}

	vm, _ := client.GetVM(ctx, "", "102")
	if vm.Status != models.VMStatusRunning {
		t.Errorf("Expected VM status 'running' after start, got '%s'", vm.Status)
	}

	// Stop VM
	upid, err = client.StopVM(ctx, "pve-node2", "102", false)
	if err != nil {
		t.Fatalf("StopVM failed: %v", err)
	}
	if upid == "" {
		t.Error("StopVM returned empty UPID")
	}

	vm, _ = client.GetVM(ctx, "", "102")
	if vm.Status != models.VMStatusStopped {
		t.Errorf("Expected VM status 'stopped' after stop, got '%s'", vm.Status)
	}

	// Force stop
	client.StartVM(ctx, "pve-node2", "102")
	upid, err = client.StopVM(ctx, "pve-node2", "102", true)
	if err != nil {
		t.Fatalf("Force StopVM failed: %v", err)
	}

	// Reboot VM
	client.StartVM(ctx, "pve-node2", "102")
	upid, err = client.RebootVM(ctx, "pve-node2", "102")
	if err != nil {
		t.Fatalf("RebootVM failed: %v", err)
	}
	if upid == "" {
		t.Error("RebootVM returned empty UPID")
	}

	// Reset VM
	upid, err = client.ResetVM(ctx, "pve-node2", "102")
	if err != nil {
		t.Fatalf("ResetVM failed: %v", err)
	}
	if upid == "" {
		t.Error("ResetVM returned empty UPID")
	}
}

func TestMockClientSuspendResume(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	// Suspend VM
	upid, err := client.SuspendVM(ctx, "pve-node1", "100")
	if err != nil {
		t.Fatalf("SuspendVM failed: %v", err)
	}
	if upid == "" {
		t.Error("SuspendVM returned empty UPID")
	}

	vm, _ := client.GetVM(ctx, "", "100")
	if vm.Status != models.VMStatusPaused {
		t.Errorf("Expected VM status 'paused' after suspend, got '%s'", vm.Status)
	}

	// Resume VM
	upid, err = client.ResumeVM(ctx, "pve-node1", "100")
	if err != nil {
		t.Fatalf("ResumeVM failed: %v", err)
	}
	if upid == "" {
		t.Error("ResumeVM returned empty UPID")
	}

	vm, _ = client.GetVM(ctx, "", "100")
	if vm.Status != models.VMStatusRunning {
		t.Errorf("Expected VM status 'running' after resume, got '%s'", vm.Status)
	}
}

func TestMockClientSnapshots(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	// List snapshots
	snapshots, err := client.ListSnapshots(ctx, "pve-node1", "100")
	if err != nil {
		t.Fatalf("ListSnapshots failed: %v", err)
	}

	initialCount := len(snapshots)

	// Create snapshot
	req := &models.CreateSnapshotRequest{
		Name:        "test-snapshot",
		Description: "Test snapshot",
		IncludeRAM:  true,
	}
	snapshot, err := client.CreateSnapshot(ctx, "pve-node1", "100", req)
	if err != nil {
		t.Fatalf("CreateSnapshot failed: %v", err)
	}

	if snapshot.Name != "test-snapshot" {
		t.Errorf("Expected snapshot name 'test-snapshot', got '%s'", snapshot.Name)
	}

	// Verify snapshot was added
	snapshots, _ = client.ListSnapshots(ctx, "pve-node1", "100")
	if len(snapshots) != initialCount+1 {
		t.Errorf("Expected %d snapshots, got %d", initialCount+1, len(snapshots))
	}

	// Rollback to snapshot
	err = client.RollbackSnapshot(ctx, "pve-node1", "100", "test-snapshot")
	if err != nil {
		t.Fatalf("RollbackSnapshot failed: %v", err)
	}

	// Delete snapshot
	err = client.DeleteSnapshot(ctx, "pve-node1", "100", "test-snapshot")
	if err != nil {
		t.Fatalf("DeleteSnapshot failed: %v", err)
	}

	// Verify snapshot was deleted
	snapshots, _ = client.ListSnapshots(ctx, "pve-node1", "100")
	if len(snapshots) != initialCount {
		t.Errorf("Expected %d snapshots after delete, got %d", initialCount, len(snapshots))
	}

	// Try to rollback to non-existent snapshot
	err = client.RollbackSnapshot(ctx, "pve-node1", "100", "nonexistent")
	if err == nil {
		t.Error("Expected error for non-existent snapshot rollback")
	}
}

func TestMockClientListTemplates(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	templates, err := client.ListTemplates(ctx)
	if err != nil {
		t.Fatalf("ListTemplates failed: %v", err)
	}

	if len(templates) == 0 {
		t.Error("Expected templates, got empty list")
	}

	// Check template properties
	for _, tmpl := range templates {
		if tmpl.ID == "" {
			t.Error("Template has empty ID")
		}
		if tmpl.Name == "" {
			t.Error("Template has empty name")
		}
	}
}

func TestMockClientListStorages(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	// List all storage
	storages, err := client.ListStorages(ctx, "")
	if err != nil {
		t.Fatalf("ListStorages failed: %v", err)
	}

	if len(storages) == 0 {
		t.Error("Expected storages, got empty list")
	}

	// List storage by node
	storages, err = client.ListStorages(ctx, "pve-node1")
	if err != nil {
		t.Fatalf("ListStorages by node failed: %v", err)
	}

	if len(storages) == 0 {
		t.Error("Expected storages for pve-node1")
	}
}

func TestMockClientListNetworks(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	networks, err := client.ListNetworks(ctx, "pve-node1")
	if err != nil {
		t.Fatalf("ListNetworks failed: %v", err)
	}

	if len(networks) == 0 {
		t.Error("Expected networks, got empty list")
	}

	// Check network properties
	for _, net := range networks {
		if net.Name == "" {
			t.Error("Network has empty name")
		}
		if net.Type == "" {
			t.Error("Network has empty type")
		}
	}
}

func TestMockClientGetTask(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	task, err := client.GetTask(ctx, "pve-node1", "UPID:pve-node1:00001234:12345678:00000000:qmcreate:100:root@pam:")
	if err != nil {
		t.Fatalf("GetTask failed: %v", err)
	}

	if task.Status != "stopped" {
		t.Errorf("Expected task status 'stopped', got '%s'", task.Status)
	}

	if task.ExitStatus != "OK" {
		t.Errorf("Expected exit status 'OK', got '%s'", task.ExitStatus)
	}
}

func TestMockClientGetVNCConsole(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	console, err := client.GetVNCConsole(ctx, "pve-node1", "100")
	if err != nil {
		t.Fatalf("GetVNCConsole failed: %v", err)
	}

	if console.Type != "vnc" {
		t.Errorf("Expected console type 'vnc', got '%s'", console.Type)
	}

	if console.URL == "" {
		t.Error("Console URL is empty")
	}

	// Test for non-existent VM
	_, err = client.GetVNCConsole(ctx, "pve-node1", "99999")
	if err == nil {
		t.Error("Expected error for non-existent VM console")
	}
}

func TestMockClientAddVM(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	newVM := &models.VirtualMachine{
		ID:        "999",
		Name:      "manually-added-vm",
		Status:    models.VMStatusStopped,
		Node:      "pve-node1",
		Cores:     2,
		Memory:    2048,
		CreatedAt: time.Now(),
	}

	client.AddVM(newVM)

	vm, err := client.GetVM(ctx, "", "999")
	if err != nil {
		t.Fatalf("Failed to get manually added VM: %v", err)
	}

	if vm.Name != "manually-added-vm" {
		t.Errorf("Expected VM name 'manually-added-vm', got '%s'", vm.Name)
	}
}

func TestMockClientAddNode(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	initialNodes, _ := client.ListNodes(ctx)
	initialCount := len(initialNodes)

	newNode := models.Node{
		Name:   "pve-node-new",
		Status: "online",
		Cores:  4,
		Memory: 8589934592,
	}

	client.AddNode(newNode)

	nodes, _ := client.ListNodes(ctx)
	if len(nodes) != initialCount+1 {
		t.Errorf("Expected %d nodes, got %d", initialCount+1, len(nodes))
	}
}

func TestMockClientReset(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	// Delete a VM
	client.DeleteVM(ctx, "", "100")

	// Set error
	client.SetError(true, "test error")

	// Reset
	client.Reset()

	// Should be back to normal
	vm, err := client.GetVM(ctx, "", "100")
	if err != nil {
		t.Fatalf("VM should exist after reset: %v", err)
	}

	if vm.Name != "test-web-server" {
		t.Errorf("Expected original VM name after reset")
	}
}

func TestMockClientErrorHandling(t *testing.T) {
	client := NewMockClient()
	ctx := context.Background()

	client.SetError(true, "mock error")

	// All operations should fail
	_, err := client.ListNodes(ctx)
	if err == nil {
		t.Error("Expected error for ListNodes")
	}

	_, err = client.ListVMs(ctx, "")
	if err == nil {
		t.Error("Expected error for ListVMs")
	}

	_, err = client.GetVM(ctx, "", "100")
	if err == nil {
		t.Error("Expected error for GetVM")
	}

	_, _, err = client.CreateVM(ctx, &models.CreateVMRequest{Name: "test", Template: "ubuntu"})
	if err == nil {
		t.Error("Expected error for CreateVM")
	}

	err = client.DeleteVM(ctx, "", "100")
	if err == nil {
		t.Error("Expected error for DeleteVM")
	}

	_, err = client.StartVM(ctx, "", "100")
	if err == nil {
		t.Error("Expected error for StartVM")
	}

	_, err = client.ListTemplates(ctx)
	if err == nil {
		t.Error("Expected error for ListTemplates")
	}

	_, err = client.ListStorages(ctx, "")
	if err == nil {
		t.Error("Expected error for ListStorages")
	}

	_, err = client.ListNetworks(ctx, "")
	if err == nil {
		t.Error("Expected error for ListNetworks")
	}
}

func TestProxmoxClientInterface(t *testing.T) {
	// Verify that MockClient implements ProxmoxClient interface
	var _ ProxmoxClient = (*MockClient)(nil)

	// Create mock and use it as interface
	var client ProxmoxClient = NewMockClient()
	ctx := context.Background()

	// Should be able to call all interface methods
	_, err := client.GetVersion(ctx)
	if err != nil {
		t.Errorf("Interface method failed: %v", err)
	}
}
