package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oblak/izvor/internal/models"
	"github.com/oblak/izvor/internal/proxmox"
)

// testServer creates a new server with a mock Proxmox client for testing
func testServer(t *testing.T) (*Server, *proxmox.MockClient) {
	mockClient := proxmox.NewMockClient()
	cfg := Config{
		Port: "8082",
	}
	server, err := NewServer(cfg, mockClient)
	if err != nil {
		t.Fatalf("Failed to create test server: %v", err)
	}
	return server, mockClient
}

func TestHealthCheck(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/health", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if response["status"] != "healthy" {
		t.Errorf("Expected status 'healthy', got '%s'", response["status"])
	}

	if response["proxmox_version"] != "8.0.4" {
		t.Errorf("Expected version '8.0.4', got '%s'", response["proxmox_version"])
	}
}

func TestHealthCheckFailure(t *testing.T) {
	server, mock := testServer(t)
	mock.SetError(true, "connection refused")

	req, err := http.NewRequest("GET", "/health", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected status %d, got %d", http.StatusServiceUnavailable, rr.Code)
	}
}

func TestGetConfigFromEnv(t *testing.T) {
	cfg := GetConfigFromEnv()

	if cfg.Port != "8082" {
		t.Errorf("Expected default port 8082, got %s", cfg.Port)
	}

	if cfg.ProxmoxUser != "root@pam" {
		t.Errorf("Expected default user root@pam, got %s", cfg.ProxmoxUser)
	}
}

func TestListVMs(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/vms", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	count, ok := response["count"].(float64)
	if !ok || count < 1 {
		t.Errorf("Expected at least 1 VM, got %v", response["count"])
	}
}

func TestListVMsByNode(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/vms?node=pve-node1", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have VMs from node1
	if response["count"].(float64) < 1 {
		t.Errorf("Expected VMs on pve-node1")
	}
}

func TestGetVM(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/vms/100", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var vm models.VirtualMachine
	if err := json.Unmarshal(rr.Body.Bytes(), &vm); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if vm.ID != "100" {
		t.Errorf("Expected VM ID '100', got '%s'", vm.ID)
	}

	if vm.Name != "test-web-server" {
		t.Errorf("Expected VM name 'test-web-server', got '%s'", vm.Name)
	}
}

func TestGetVMNotFound(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/vms/99999", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status %d, got %d", http.StatusNotFound, rr.Code)
	}
}

func TestCreateVM(t *testing.T) {
	server, _ := testServer(t)

	createReq := models.CreateVMRequest{
		Name:     "test-new-vm",
		Template: "ubuntu-22.04-template",
		Size:     "small",
	}

	body, _ := json.Marshal(createReq)
	req, err := http.NewRequest("POST", "/api/v1/vms", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if response["vmid"] == nil {
		t.Errorf("Expected vmid in response")
	}
}

func TestCreateVMInvalidRequest(t *testing.T) {
	server, _ := testServer(t)

	// Missing required fields
	createReq := models.CreateVMRequest{
		Name: "", // Invalid: empty name
	}

	body, _ := json.Marshal(createReq)
	req, err := http.NewRequest("POST", "/api/v1/vms", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestDeleteVM(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("DELETE", "/api/v1/vms/102", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}

	// Verify VM is deleted
	req, _ = http.NewRequest("GET", "/api/v1/vms/102", nil)
	rr = httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected deleted VM to return 404, got %d", rr.Code)
	}
}

func TestVMActions(t *testing.T) {
	tests := []struct {
		name       string
		vmid       string
		action     models.VMAction
		wantStatus int
	}{
		{
			name:       "Start VM",
			vmid:       "102", // Stopped VM
			action:     models.ActionStart,
			wantStatus: http.StatusOK,
		},
		{
			name:       "Stop VM",
			vmid:       "100", // Running VM
			action:     models.ActionStop,
			wantStatus: http.StatusOK,
		},
		{
			name:       "Reboot VM",
			vmid:       "100",
			action:     models.ActionReboot,
			wantStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, _ := testServer(t)

			actionReq := models.VMActionRequest{
				Action: tt.action,
			}

			body, _ := json.Marshal(actionReq)
			req, err := http.NewRequest("POST", "/api/v1/vms/"+tt.vmid+"/actions", bytes.NewBuffer(body))
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Content-Type", "application/json")

			rr := httptest.NewRecorder()
			server.Router().ServeHTTP(rr, req)

			if rr.Code != tt.wantStatus {
				t.Errorf("Expected status %d, got %d: %s", tt.wantStatus, rr.Code, rr.Body.String())
			}
		})
	}
}

func TestListNodes(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/nodes", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	count, ok := response["count"].(float64)
	if !ok || count < 1 {
		t.Errorf("Expected at least 1 node, got %v", response["count"])
	}
}

func TestGetNode(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/nodes/pve-node1", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var node models.Node
	if err := json.Unmarshal(rr.Body.Bytes(), &node); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if node.Name != "pve-node1" {
		t.Errorf("Expected node name 'pve-node1', got '%s'", node.Name)
	}
}

func TestListTemplates(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/templates", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	count, ok := response["count"].(float64)
	if !ok || count < 1 {
		t.Errorf("Expected at least 1 template, got %v", response["count"])
	}
}

func TestListVMSizes(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/vms/sizes", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	sizes, ok := response["sizes"].([]interface{})
	if !ok || len(sizes) < 1 {
		t.Errorf("Expected sizes list, got %v", response["sizes"])
	}
}

func TestSnapshots(t *testing.T) {
	server, _ := testServer(t)

	// List snapshots
	req, err := http.NewRequest("GET", "/api/v1/vms/100/snapshots", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	// Create snapshot
	createReq := models.CreateSnapshotRequest{
		Name:        "test-snapshot",
		Description: "Test snapshot",
	}

	body, _ := json.Marshal(createReq)
	req, err = http.NewRequest("POST", "/api/v1/vms/100/snapshots", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr = httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
	}
}

func TestClusterStatus(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/cluster/status", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if response["status"] != "healthy" {
		t.Errorf("Expected status 'healthy', got '%s'", response["status"])
	}
}

func TestClusterResources(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/cluster/resources", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var summary models.ResourceSummary
	if err := json.Unmarshal(rr.Body.Bytes(), &summary); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if summary.TotalCores < 1 {
		t.Errorf("Expected total cores > 0, got %d", summary.TotalCores)
	}

	if summary.TotalVMs < 1 {
		t.Errorf("Expected total VMs > 0, got %d", summary.TotalVMs)
	}
}

func TestListStorage(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/storage", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	count, ok := response["count"].(float64)
	if !ok || count < 1 {
		t.Errorf("Expected at least 1 storage, got %v", response["count"])
	}
}

func TestListNodeNetworks(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/nodes/pve-node1/networks", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	count, ok := response["count"].(float64)
	if !ok || count < 1 {
		t.Errorf("Expected at least 1 network, got %v", response["count"])
	}
}

func TestGetVMConsole(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/vms/100/console", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}

	var console models.Console
	if err := json.Unmarshal(rr.Body.Bytes(), &console); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if console.Type != "vnc" {
		t.Errorf("Expected console type 'vnc', got '%s'", console.Type)
	}
}

func TestUpdateVM(t *testing.T) {
	server, _ := testServer(t)

	updateReq := models.UpdateVMRequest{
		Description: stringPtr("Updated description"),
	}

	body, _ := json.Marshal(updateReq)
	req, err := http.NewRequest("PUT", "/api/v1/vms/100", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}
}

func TestUpdateVMNotFound(t *testing.T) {
	server, _ := testServer(t)

	updateReq := models.UpdateVMRequest{
		Description: stringPtr("Updated description"),
	}

	body, _ := json.Marshal(updateReq)
	req, err := http.NewRequest("PUT", "/api/v1/vms/99999", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status %d, got %d", http.StatusNotFound, rr.Code)
	}
}

func TestDeleteSnapshot(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("DELETE", "/api/v1/vms/100/snapshots/before-upgrade", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}
}

func TestDeleteSnapshotNotFound(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("DELETE", "/api/v1/vms/100/snapshots/nonexistent", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status %d, got %d", http.StatusInternalServerError, rr.Code)
	}
}

func TestRollbackSnapshot(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("POST", "/api/v1/vms/100/snapshots/before-upgrade/rollback", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}
}

func TestRollbackSnapshotNotFound(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("POST", "/api/v1/vms/100/snapshots/nonexistent/rollback", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status %d, got %d", http.StatusInternalServerError, rr.Code)
	}
}

func TestListNodeStorage(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/nodes/pve-node1/storage", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	count, ok := response["count"].(float64)
	if !ok || count < 1 {
		t.Errorf("Expected at least 1 storage, got %v", response["count"])
	}
}

func TestGetTask(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/tasks/UPID:pve-node1:00001234:12345678:00000000:qmcreate:100:root@pam:?node=pve-node1", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}

	var task models.Task
	if err := json.Unmarshal(rr.Body.Bytes(), &task); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if task.Status != "stopped" {
		t.Errorf("Expected task status 'stopped', got '%s'", task.Status)
	}
}

func TestVMActionSnapshot(t *testing.T) {
	server, _ := testServer(t)

	actionReq := models.VMActionRequest{
		Action:       models.ActionSnapshot,
		SnapshotName: "test-snap",
	}

	body, _ := json.Marshal(actionReq)
	req, err := http.NewRequest("POST", "/api/v1/vms/100/actions", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}
}

func TestVMActionClone(t *testing.T) {
	server, _ := testServer(t)

	actionReq := models.VMActionRequest{
		Action:    models.ActionClone,
		CloneName: "cloned-vm",
	}

	body, _ := json.Marshal(actionReq)
	req, err := http.NewRequest("POST", "/api/v1/vms/100/actions", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}
}

func TestVMActionSuspendResume(t *testing.T) {
	server, _ := testServer(t)

	// Test suspend
	actionReq := models.VMActionRequest{
		Action: models.ActionSuspend,
	}

	body, _ := json.Marshal(actionReq)
	req, err := http.NewRequest("POST", "/api/v1/vms/100/actions", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Suspend: Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}

	// Test resume
	actionReq = models.VMActionRequest{
		Action: models.ActionResume,
	}

	body, _ = json.Marshal(actionReq)
	req, err = http.NewRequest("POST", "/api/v1/vms/100/actions", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr = httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Resume: Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}
}

func TestVMActionReset(t *testing.T) {
	server, _ := testServer(t)

	actionReq := models.VMActionRequest{
		Action: models.ActionReset,
	}

	body, _ := json.Marshal(actionReq)
	req, err := http.NewRequest("POST", "/api/v1/vms/100/actions", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}
}

func TestVMActionShutdown(t *testing.T) {
	server, _ := testServer(t)

	actionReq := models.VMActionRequest{
		Action: models.ActionShutdown,
	}

	body, _ := json.Marshal(actionReq)
	req, err := http.NewRequest("POST", "/api/v1/vms/100/actions", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
	}
}

func TestVMActionInvalid(t *testing.T) {
	server, _ := testServer(t)

	actionReq := models.VMActionRequest{
		Action: "invalid-action",
	}

	body, _ := json.Marshal(actionReq)
	req, err := http.NewRequest("POST", "/api/v1/vms/100/actions", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestVMActionNotFound(t *testing.T) {
	server, _ := testServer(t)

	actionReq := models.VMActionRequest{
		Action: models.ActionStart,
	}

	body, _ := json.Marshal(actionReq)
	req, err := http.NewRequest("POST", "/api/v1/vms/99999/actions", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status %d, got %d", http.StatusNotFound, rr.Code)
	}
}

func TestGetNodeNotFound(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/nodes/nonexistent-node", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status %d, got %d", http.StatusNotFound, rr.Code)
	}
}

func TestListVMsError(t *testing.T) {
	server, mock := testServer(t)
	mock.SetError(true, "proxmox connection failed")

	req, err := http.NewRequest("GET", "/api/v1/vms", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status %d, got %d", http.StatusInternalServerError, rr.Code)
	}
}

func TestCreateVMWithNanoSize(t *testing.T) {
	server, _ := testServer(t)

	createReq := models.CreateVMRequest{
		Name:     "tiny-vm",
		Template: "ubuntu-22.04-template",
		Size:     "nano",
	}

	body, _ := json.Marshal(createReq)
	req, err := http.NewRequest("POST", "/api/v1/vms", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
	}
}

func TestDeleteVMNotFound(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("DELETE", "/api/v1/vms/99999", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status %d, got %d", http.StatusNotFound, rr.Code)
	}
}

func TestGetVMWithNodeParam(t *testing.T) {
	server, _ := testServer(t)

	req, err := http.NewRequest("GET", "/api/v1/vms/100?node=pve-node1", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}
}

func TestCreateSnapshotInvalid(t *testing.T) {
	server, _ := testServer(t)

	// Empty name should fail
	createReq := models.CreateSnapshotRequest{
		Name: "",
	}

	body, _ := json.Marshal(createReq)
	req, err := http.NewRequest("POST", "/api/v1/vms/100/snapshots", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

// Helper function
func stringPtr(s string) *string {
	return &s
}
