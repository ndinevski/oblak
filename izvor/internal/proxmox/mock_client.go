package proxmox

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/oblak/izvor/internal/models"
)

// MockClient is a mock implementation of ProxmoxClient for testing
type MockClient struct {
	mu        sync.RWMutex
	nodes     []models.Node
	vms       map[string]*models.VirtualMachine // key: vmid
	snapshots map[string][]models.Snapshot      // key: vmid
	templates []models.VMTemplate
	storages  []models.Storage
	networks  []models.Network
	nextVMID  int

	// For testing errors
	ShouldFail   bool
	FailMessage  string
	HealthStatus error
}

// NewMockClient creates a new mock Proxmox client with sample data
func NewMockClient() *MockClient {
	m := &MockClient{
		nodes:     make([]models.Node, 0),
		vms:       make(map[string]*models.VirtualMachine),
		snapshots: make(map[string][]models.Snapshot),
		templates: make([]models.VMTemplate, 0),
		storages:  make([]models.Storage, 0),
		networks:  make([]models.Network, 0),
		nextVMID:  100,
	}

	// Add default test data
	m.addDefaultTestData()

	return m
}

// addDefaultTestData adds sample data for testing
func (m *MockClient) addDefaultTestData() {
	// Add a test node
	m.nodes = append(m.nodes, models.Node{
		Name:        "pve-node1",
		Status:      "online",
		Cores:       16,
		Memory:      68719476736,   // 64GB
		MemoryUsed:  17179869184,   // 16GB
		DiskTotal:   1099511627776, // 1TB
		DiskUsed:    274877906944,  // 256GB
		CPUUsage:    25.5,
		MemoryUsage: 25.0,
		Uptime:      86400, // 1 day
	})

	// Add a second node
	m.nodes = append(m.nodes, models.Node{
		Name:        "pve-node2",
		Status:      "online",
		Cores:       8,
		Memory:      34359738368,  // 32GB
		MemoryUsed:  8589934592,   // 8GB
		DiskTotal:   549755813888, // 512GB
		DiskUsed:    137438953472, // 128GB
		CPUUsage:    15.0,
		MemoryUsage: 25.0,
		Uptime:      172800, // 2 days
	})

	// Add test VMs
	m.vms["100"] = &models.VirtualMachine{
		ID:        "100",
		Name:      "test-web-server",
		Status:    models.VMStatusRunning,
		Node:      "pve-node1",
		Cores:     2,
		Memory:    2048,
		DiskSize:  40,
		OSType:    models.OSTypeLinux,
		IPAddress: "192.168.1.100",
		Tags:      []string{"web", "production"},
		CPUUsage:  10.5,
		Uptime:    3600,
		CreatedAt: time.Now().Add(-24 * time.Hour),
	}

	m.vms["101"] = &models.VirtualMachine{
		ID:        "101",
		Name:      "test-db-server",
		Status:    models.VMStatusRunning,
		Node:      "pve-node1",
		Cores:     4,
		Memory:    8192,
		DiskSize:  100,
		OSType:    models.OSTypeLinux,
		IPAddress: "192.168.1.101",
		Tags:      []string{"database", "production"},
		CPUUsage:  35.0,
		Uptime:    7200,
		CreatedAt: time.Now().Add(-48 * time.Hour),
	}

	m.vms["102"] = &models.VirtualMachine{
		ID:        "102",
		Name:      "test-dev-server",
		Status:    models.VMStatusStopped,
		Node:      "pve-node2",
		Cores:     1,
		Memory:    1024,
		DiskSize:  20,
		OSType:    models.OSTypeLinux,
		Tags:      []string{"development"},
		CreatedAt: time.Now().Add(-72 * time.Hour),
	}

	// Add test templates
	m.templates = append(m.templates, models.VMTemplate{
		ID:          "9000",
		Name:        "ubuntu-22.04-template",
		Description: "Ubuntu 22.04 LTS Cloud Image",
		OSType:      models.OSTypeLinux,
		Node:        "pve-node1",
		DiskSize:    20,
		CreatedAt:   time.Now().Add(-30 * 24 * time.Hour),
	})

	m.templates = append(m.templates, models.VMTemplate{
		ID:          "9001",
		Name:        "debian-12-template",
		Description: "Debian 12 Cloud Image",
		OSType:      models.OSTypeLinux,
		Node:        "pve-node1",
		DiskSize:    10,
		CreatedAt:   time.Now().Add(-15 * 24 * time.Hour),
	})

	// Add test storage
	m.storages = append(m.storages, models.Storage{
		Name:         "local-lvm",
		Type:         "lvmthin",
		Node:         "pve-node1",
		Total:        549755813888, // 512GB
		Used:         137438953472, // 128GB
		Available:    412316860416, // 384GB
		UsagePercent: 25.0,
		Content:      []string{"images", "rootdir"},
		Shared:       false,
		Enabled:      true,
	})

	m.storages = append(m.storages, models.Storage{
		Name:         "nfs-storage",
		Type:         "nfs",
		Node:         "pve-node1",
		Total:        2199023255552, // 2TB
		Used:         549755813888,  // 512GB
		Available:    1649267441664, // 1.5TB
		UsagePercent: 25.0,
		Content:      []string{"images", "iso", "vztmpl"},
		Shared:       true,
		Enabled:      true,
	})

	// Add test networks
	m.networks = append(m.networks, models.Network{
		Name:        "vmbr0",
		Type:        "bridge",
		Node:        "pve-node1",
		Address:     "192.168.1.1",
		Netmask:     "255.255.255.0",
		Gateway:     "192.168.1.1",
		BridgePorts: "enp0s3",
		Active:      true,
	})

	m.networks = append(m.networks, models.Network{
		Name:        "vmbr1",
		Type:        "bridge",
		Node:        "pve-node1",
		Address:     "10.0.0.1",
		Netmask:     "255.255.255.0",
		BridgePorts: "enp0s4",
		Active:      true,
	})

	// Add test snapshots
	m.snapshots["100"] = []models.Snapshot{
		{
			Name:        "before-upgrade",
			Description: "Snapshot before system upgrade",
			VMID:        "100",
			CreatedAt:   time.Now().Add(-12 * time.Hour),
			VMState:     false,
		},
	}
}

// HealthCheck verifies connectivity
func (m *MockClient) HealthCheck(ctx context.Context) error {
	if m.ShouldFail {
		return fmt.Errorf(m.FailMessage)
	}
	return m.HealthStatus
}

// GetVersion returns the mock Proxmox version
func (m *MockClient) GetVersion(ctx context.Context) (string, error) {
	if m.ShouldFail {
		return "", fmt.Errorf(m.FailMessage)
	}
	return "8.0.4", nil
}

// GetDefaultNode returns the first available node
func (m *MockClient) GetDefaultNode(ctx context.Context) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ShouldFail {
		return "", fmt.Errorf(m.FailMessage)
	}

	if len(m.nodes) == 0 {
		return "", fmt.Errorf("no nodes available")
	}

	for _, node := range m.nodes {
		if node.Status == "online" {
			return node.Name, nil
		}
	}

	return m.nodes[0].Name, nil
}

// ListNodes returns all mock nodes
func (m *MockClient) ListNodes(ctx context.Context) ([]models.Node, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ShouldFail {
		return nil, fmt.Errorf(m.FailMessage)
	}

	return m.nodes, nil
}

// ListVMs returns VMs, optionally filtered by node
func (m *MockClient) ListVMs(ctx context.Context, node string) ([]models.VirtualMachine, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ShouldFail {
		return nil, fmt.Errorf(m.FailMessage)
	}

	var vms []models.VirtualMachine
	for _, vm := range m.vms {
		if node == "" || vm.Node == node {
			vms = append(vms, *vm)
		}
	}

	return vms, nil
}

// GetVM returns a specific VM
func (m *MockClient) GetVM(ctx context.Context, node, vmid string) (*models.VirtualMachine, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ShouldFail {
		return nil, fmt.Errorf(m.FailMessage)
	}

	vm, exists := m.vms[vmid]
	if !exists {
		return nil, fmt.Errorf("VM %s not found", vmid)
	}

	if node != "" && vm.Node != node {
		return nil, fmt.Errorf("VM %s not found on node %s", vmid, node)
	}

	return vm, nil
}

// CreateVM creates a new mock VM
func (m *MockClient) CreateVM(ctx context.Context, req *models.CreateVMRequest) (*models.VirtualMachine, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ShouldFail {
		return nil, "", fmt.Errorf(m.FailMessage)
	}

	// Apply size defaults
	req.ApplySize()

	vmid := strconv.Itoa(m.nextVMID)
	m.nextVMID++

	node := req.Node
	if node == "" && len(m.nodes) > 0 {
		node = m.nodes[0].Name
	}

	vm := &models.VirtualMachine{
		ID:        vmid,
		Name:      req.Name,
		Status:    models.VMStatusStopped,
		Node:      node,
		Cores:     req.Cores,
		Memory:    req.Memory,
		DiskSize:  req.DiskSize,
		OSType:    req.OSType,
		Tags:      req.Tags,
		CloudInit: req.CloudInit,
		CreatedAt: time.Now(),
	}

	if req.StartOnCreate {
		vm.Status = models.VMStatusRunning
	}

	m.vms[vmid] = vm

	return vm, vmid, nil
}

// DeleteVM deletes a mock VM
func (m *MockClient) DeleteVM(ctx context.Context, node, vmid string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ShouldFail {
		return fmt.Errorf(m.FailMessage)
	}

	if _, exists := m.vms[vmid]; !exists {
		return fmt.Errorf("VM %s not found", vmid)
	}

	delete(m.vms, vmid)
	delete(m.snapshots, vmid)

	return nil
}

// StartVM starts a mock VM
func (m *MockClient) StartVM(ctx context.Context, node, vmid string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ShouldFail {
		return "", fmt.Errorf(m.FailMessage)
	}

	vm, exists := m.vms[vmid]
	if !exists {
		return "", fmt.Errorf("VM %s not found", vmid)
	}

	vm.Status = models.VMStatusRunning
	return fmt.Sprintf("UPID:%s:00001234:12345678:00000000:qmstart:%s:root@pam:", node, vmid), nil
}

// StopVM stops a mock VM
func (m *MockClient) StopVM(ctx context.Context, node, vmid string, force bool) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ShouldFail {
		return "", fmt.Errorf(m.FailMessage)
	}

	vm, exists := m.vms[vmid]
	if !exists {
		return "", fmt.Errorf("VM %s not found", vmid)
	}

	vm.Status = models.VMStatusStopped
	action := "qmshutdown"
	if force {
		action = "qmstop"
	}
	return fmt.Sprintf("UPID:%s:00001234:12345678:00000000:%s:%s:root@pam:", node, action, vmid), nil
}

// RebootVM reboots a mock VM
func (m *MockClient) RebootVM(ctx context.Context, node, vmid string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ShouldFail {
		return "", fmt.Errorf(m.FailMessage)
	}

	if _, exists := m.vms[vmid]; !exists {
		return "", fmt.Errorf("VM %s not found", vmid)
	}

	return fmt.Sprintf("UPID:%s:00001234:12345678:00000000:qmreboot:%s:root@pam:", node, vmid), nil
}

// ResetVM resets a mock VM
func (m *MockClient) ResetVM(ctx context.Context, node, vmid string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ShouldFail {
		return "", fmt.Errorf(m.FailMessage)
	}

	if _, exists := m.vms[vmid]; !exists {
		return "", fmt.Errorf("VM %s not found", vmid)
	}

	return fmt.Sprintf("UPID:%s:00001234:12345678:00000000:qmreset:%s:root@pam:", node, vmid), nil
}

// SuspendVM suspends a mock VM
func (m *MockClient) SuspendVM(ctx context.Context, node, vmid string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ShouldFail {
		return "", fmt.Errorf(m.FailMessage)
	}

	vm, exists := m.vms[vmid]
	if !exists {
		return "", fmt.Errorf("VM %s not found", vmid)
	}

	vm.Status = models.VMStatusPaused
	return fmt.Sprintf("UPID:%s:00001234:12345678:00000000:qmsuspend:%s:root@pam:", node, vmid), nil
}

// ResumeVM resumes a mock VM
func (m *MockClient) ResumeVM(ctx context.Context, node, vmid string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ShouldFail {
		return "", fmt.Errorf(m.FailMessage)
	}

	vm, exists := m.vms[vmid]
	if !exists {
		return "", fmt.Errorf("VM %s not found", vmid)
	}

	vm.Status = models.VMStatusRunning
	return fmt.Sprintf("UPID:%s:00001234:12345678:00000000:qmresume:%s:root@pam:", node, vmid), nil
}

// ListSnapshots returns snapshots for a VM
func (m *MockClient) ListSnapshots(ctx context.Context, node, vmid string) ([]models.Snapshot, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ShouldFail {
		return nil, fmt.Errorf(m.FailMessage)
	}

	if _, exists := m.vms[vmid]; !exists {
		return nil, fmt.Errorf("VM %s not found", vmid)
	}

	snapshots := m.snapshots[vmid]
	if snapshots == nil {
		return []models.Snapshot{}, nil
	}

	return snapshots, nil
}

// CreateSnapshot creates a snapshot for a VM
func (m *MockClient) CreateSnapshot(ctx context.Context, node, vmid string, req *models.CreateSnapshotRequest) (*models.Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ShouldFail {
		return nil, fmt.Errorf(m.FailMessage)
	}

	if _, exists := m.vms[vmid]; !exists {
		return nil, fmt.Errorf("VM %s not found", vmid)
	}

	snapshot := models.Snapshot{
		Name:        req.Name,
		Description: req.Description,
		VMID:        vmid,
		CreatedAt:   time.Now(),
		VMState:     req.IncludeRAM,
	}

	m.snapshots[vmid] = append(m.snapshots[vmid], snapshot)

	return &snapshot, nil
}

// DeleteSnapshot deletes a snapshot
func (m *MockClient) DeleteSnapshot(ctx context.Context, node, vmid, name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ShouldFail {
		return fmt.Errorf(m.FailMessage)
	}

	snapshots := m.snapshots[vmid]
	for i, s := range snapshots {
		if s.Name == name {
			m.snapshots[vmid] = append(snapshots[:i], snapshots[i+1:]...)
			return nil
		}
	}

	return fmt.Errorf("snapshot %s not found", name)
}

// RollbackSnapshot rolls back to a snapshot
func (m *MockClient) RollbackSnapshot(ctx context.Context, node, vmid, name string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ShouldFail {
		return fmt.Errorf(m.FailMessage)
	}

	snapshots := m.snapshots[vmid]
	for _, s := range snapshots {
		if s.Name == name {
			return nil
		}
	}

	return fmt.Errorf("snapshot %s not found", name)
}

// ListTemplates returns all templates
func (m *MockClient) ListTemplates(ctx context.Context) ([]models.VMTemplate, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ShouldFail {
		return nil, fmt.Errorf(m.FailMessage)
	}

	return m.templates, nil
}

// ListStorages returns storage pools
func (m *MockClient) ListStorages(ctx context.Context, node string) ([]models.Storage, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ShouldFail {
		return nil, fmt.Errorf(m.FailMessage)
	}

	var storages []models.Storage
	for _, s := range m.storages {
		if node == "" || s.Node == node || s.Shared {
			storages = append(storages, s)
		}
	}

	return storages, nil
}

// ListNetworks returns network configurations
func (m *MockClient) ListNetworks(ctx context.Context, node string) ([]models.Network, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ShouldFail {
		return nil, fmt.Errorf(m.FailMessage)
	}

	var networks []models.Network
	for _, n := range m.networks {
		if node == "" || n.Node == node {
			networks = append(networks, n)
		}
	}

	return networks, nil
}

// GetTask returns task status
func (m *MockClient) GetTask(ctx context.Context, node, upid string) (*models.Task, error) {
	if m.ShouldFail {
		return nil, fmt.Errorf(m.FailMessage)
	}

	return &models.Task{
		UPID:       upid,
		Node:       node,
		Type:       "qmcreate",
		Status:     "stopped",
		ExitStatus: "OK",
		User:       "root@pam",
		StartTime:  time.Now().Add(-1 * time.Minute),
		EndTime:    time.Now(),
	}, nil
}

// GetVNCConsole returns VNC console access
func (m *MockClient) GetVNCConsole(ctx context.Context, node, vmid string) (*models.Console, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.ShouldFail {
		return nil, fmt.Errorf(m.FailMessage)
	}

	if _, exists := m.vms[vmid]; !exists {
		return nil, fmt.Errorf("VM %s not found", vmid)
	}

	return &models.Console{
		Type:   "vnc",
		Host:   "mock-proxmox:8006",
		Port:   5900,
		Ticket: "mock-vnc-ticket",
		URL:    fmt.Sprintf("https://mock-proxmox:8006/?console=kvm&novnc=1&vmid=%s&node=%s", vmid, node),
	}, nil
}

// AddVM adds a VM to the mock (for testing)
func (m *MockClient) AddVM(vm *models.VirtualMachine) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.vms[vm.ID] = vm
}

// AddNode adds a node to the mock (for testing)
func (m *MockClient) AddNode(node models.Node) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.nodes = append(m.nodes, node)
}

// SetError configures the mock to return errors
func (m *MockClient) SetError(shouldFail bool, message string) {
	m.ShouldFail = shouldFail
	m.FailMessage = message
}

// Reset resets the mock to its initial state
func (m *MockClient) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.nodes = make([]models.Node, 0)
	m.vms = make(map[string]*models.VirtualMachine)
	m.snapshots = make(map[string][]models.Snapshot)
	m.templates = make([]models.VMTemplate, 0)
	m.storages = make([]models.Storage, 0)
	m.networks = make([]models.Network, 0)
	m.nextVMID = 100
	m.ShouldFail = false
	m.FailMessage = ""
	m.addDefaultTestData()
}

// Verify MockClient implements ProxmoxClient
var _ ProxmoxClient = (*MockClient)(nil)
