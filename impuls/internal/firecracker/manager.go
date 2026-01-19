package firecracker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
)

// Config holds the Firecracker manager configuration
type Config struct {
	FirecrackerBin string
	KernelPath     string
	RootFSPath     string
	DataDir        string
}

// VMConfig holds configuration for a single VM
type VMConfig struct {
	ID           string
	FunctionName string
	MemoryMB     int
	VCPUs        int
	CodePath     string
	Handler      string
	Runtime      string
	Environment  map[string]string
}

// VM represents a running Firecracker VM
type VM struct {
	ID           string
	Config       VMConfig
	SocketPath   string
	Process      *exec.Cmd
	IPAddress    string
	State        VMState
	CreatedAt    time.Time
	mu           sync.Mutex
}

// VMState represents the state of a VM
type VMState string

const (
	VMStateCreating VMState = "creating"
	VMStateRunning  VMState = "running"
	VMStateStopped  VMState = "stopped"
	VMStateError    VMState = "error"
)

// Manager manages Firecracker VMs
type Manager struct {
	config     Config
	vms        map[string]*VM
	mu         sync.RWMutex
	httpClient *http.Client
}

// NewManager creates a new Firecracker manager
func NewManager(config Config) (*Manager, error) {
	// Verify firecracker binary exists
	if _, err := os.Stat(config.FirecrackerBin); os.IsNotExist(err) {
		// Don't fail, just log warning - allow setup without firecracker installed
		fmt.Printf("Warning: Firecracker binary not found at %s\n", config.FirecrackerBin)
	}

	// Create necessary directories
	dirs := []string{
		filepath.Join(config.DataDir, "vms"),
		filepath.Join(config.DataDir, "sockets"),
		filepath.Join(config.DataDir, "logs"),
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	// Create HTTP client with Unix socket transport
	return &Manager{
		config: config,
		vms:    make(map[string]*VM),
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

// CreateVM creates and starts a new Firecracker VM
func (m *Manager) CreateVM(ctx context.Context, config VMConfig) (*VM, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if config.ID == "" {
		config.ID = uuid.New().String()
	}

	// Set defaults
	if config.MemoryMB == 0 {
		config.MemoryMB = 128
	}
	if config.VCPUs == 0 {
		config.VCPUs = 1
	}

	// Create VM instance
	vm := &VM{
		ID:         config.ID,
		Config:     config,
		SocketPath: filepath.Join(m.config.DataDir, "sockets", config.ID+".sock"),
		State:      VMStateCreating,
		CreatedAt:  time.Now(),
	}

	// Remove existing socket if any
	os.Remove(vm.SocketPath)

	// Create log file
	logPath := filepath.Join(m.config.DataDir, "logs", config.ID+".log")
	logFile, err := os.Create(logPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create log file: %w", err)
	}

	// Start Firecracker process
	cmd := exec.CommandContext(ctx, m.config.FirecrackerBin,
		"--api-sock", vm.SocketPath,
	)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true,
	}

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("failed to start firecracker: %w", err)
	}

	vm.Process = cmd

	// Wait for socket to be ready
	if err := m.waitForSocket(vm.SocketPath, 5*time.Second); err != nil {
		cmd.Process.Kill()
		logFile.Close()
		return nil, fmt.Errorf("failed to wait for socket: %w", err)
	}

	// Configure the VM
	if err := m.configureVM(vm); err != nil {
		cmd.Process.Kill()
		logFile.Close()
		return nil, fmt.Errorf("failed to configure VM: %w", err)
	}

	// Start the VM
	if err := m.startVM(vm); err != nil {
		cmd.Process.Kill()
		logFile.Close()
		return nil, fmt.Errorf("failed to start VM: %w", err)
	}

	vm.State = VMStateRunning
	m.vms[vm.ID] = vm

	return vm, nil
}

// waitForSocket waits for the Unix socket to become available
func (m *Manager) waitForSocket(socketPath string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("unix", socketPath, time.Second)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("timeout waiting for socket %s", socketPath)
}

// configureVM configures the VM via Firecracker API
func (m *Manager) configureVM(vm *VM) error {
	// Set boot source
	bootSource := map[string]interface{}{
		"kernel_image_path": m.config.KernelPath,
		"boot_args":         "console=ttyS0 reboot=k panic=1 pci=off",
	}
	if err := m.apiCall(vm.SocketPath, "PUT", "/boot-source", bootSource); err != nil {
		return fmt.Errorf("failed to set boot source: %w", err)
	}

	// Create overlay rootfs for this VM
	overlayPath, err := m.createOverlayRootFS(vm)
	if err != nil {
		return fmt.Errorf("failed to create overlay rootfs: %w", err)
	}

	// Set root drive
	rootDrive := map[string]interface{}{
		"drive_id":       "rootfs",
		"path_on_host":   overlayPath,
		"is_root_device": true,
		"is_read_only":   false,
	}
	if err := m.apiCall(vm.SocketPath, "PUT", "/drives/rootfs", rootDrive); err != nil {
		return fmt.Errorf("failed to set root drive: %w", err)
	}

	// Set machine config
	machineConfig := map[string]interface{}{
		"vcpu_count":  vm.Config.VCPUs,
		"mem_size_mib": vm.Config.MemoryMB,
	}
	if err := m.apiCall(vm.SocketPath, "PUT", "/machine-config", machineConfig); err != nil {
		return fmt.Errorf("failed to set machine config: %w", err)
	}

	// Configure network
	if err := m.configureNetwork(vm); err != nil {
		return fmt.Errorf("failed to configure network: %w", err)
	}

	return nil
}

// createOverlayRootFS creates a copy-on-write overlay for the base rootfs
func (m *Manager) createOverlayRootFS(vm *VM) (string, error) {
	overlayPath := filepath.Join(m.config.DataDir, "vms", vm.ID, "rootfs.ext4")
	overlayDir := filepath.Dir(overlayPath)

	if err := os.MkdirAll(overlayDir, 0755); err != nil {
		return "", err
	}

	// Create a sparse copy of the base rootfs (copy-on-write using cp --reflink if available)
	cmd := exec.Command("cp", "--reflink=auto", "--sparse=always", m.config.RootFSPath, overlayPath)
	if err := cmd.Run(); err != nil {
		// Fallback: create a qcow2 overlay or just copy
		cmd = exec.Command("cp", m.config.RootFSPath, overlayPath)
		if err := cmd.Run(); err != nil {
			return "", fmt.Errorf("failed to create rootfs overlay: %w", err)
		}
	}

	return overlayPath, nil
}

// configureNetwork sets up networking for the VM
func (m *Manager) configureNetwork(vm *VM) error {
	// Create TAP device for this VM
	tapName := fmt.Sprintf("tap-%s", vm.ID[:8])
	
	// Create TAP device
	if err := exec.Command("ip", "tuntap", "add", tapName, "mode", "tap").Run(); err != nil {
		// TAP might already exist, try to continue
		fmt.Printf("Warning: failed to create TAP device %s: %v\n", tapName, err)
	}

	// Bring TAP device up
	if err := exec.Command("ip", "link", "set", tapName, "up").Run(); err != nil {
		return fmt.Errorf("failed to bring up TAP device: %w", err)
	}

	// Assign IP to TAP device (host side)
	hostIP := m.getHostIP(vm.ID)
	if err := exec.Command("ip", "addr", "add", hostIP+"/30", "dev", tapName).Run(); err != nil {
		// IP might already be assigned
		fmt.Printf("Warning: failed to assign IP to TAP device: %v\n", err)
	}

	// Store guest IP for later use
	vm.IPAddress = m.getGuestIP(vm.ID)

	// Configure network interface in Firecracker
	networkIface := map[string]interface{}{
		"iface_id":     "eth0",
		"guest_mac":    m.generateMAC(vm.ID),
		"host_dev_name": tapName,
	}
	if err := m.apiCall(vm.SocketPath, "PUT", "/network-interfaces/eth0", networkIface); err != nil {
		return fmt.Errorf("failed to configure network interface: %w", err)
	}

	return nil
}

// getHostIP generates a host IP for the TAP device
func (m *Manager) getHostIP(vmID string) string {
	// Use a simple hash to generate unique IPs
	// In production, use a proper IP allocation mechanism
	hash := 0
	for _, c := range vmID {
		hash = (hash + int(c)) % 250
	}
	return fmt.Sprintf("172.16.%d.1", hash+1)
}

// getGuestIP generates a guest IP for the VM
func (m *Manager) getGuestIP(vmID string) string {
	hash := 0
	for _, c := range vmID {
		hash = (hash + int(c)) % 250
	}
	return fmt.Sprintf("172.16.%d.2", hash+1)
}

// generateMAC generates a unique MAC address for the VM
func (m *Manager) generateMAC(vmID string) string {
	// Generate MAC from VM ID
	hash := 0
	for _, c := range vmID {
		hash = (hash + int(c)) % 256
	}
	return fmt.Sprintf("AA:FC:00:00:00:%02X", hash)
}

// startVM starts the configured VM
func (m *Manager) startVM(vm *VM) error {
	action := map[string]interface{}{
		"action_type": "InstanceStart",
	}
	return m.apiCall(vm.SocketPath, "PUT", "/actions", action)
}

// StopVM stops a running VM
func (m *Manager) StopVM(vmID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	vm, exists := m.vms[vmID]
	if !exists {
		return fmt.Errorf("VM %s not found", vmID)
	}

	return m.stopVM(vm)
}

func (m *Manager) stopVM(vm *VM) error {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	if vm.Process != nil && vm.Process.Process != nil {
		vm.Process.Process.Kill()
		vm.Process.Wait()
	}

	// Cleanup
	os.Remove(vm.SocketPath)
	
	// Remove TAP device
	tapName := fmt.Sprintf("tap-%s", vm.ID[:8])
	exec.Command("ip", "link", "del", tapName).Run()

	// Remove VM directory
	vmDir := filepath.Join(m.config.DataDir, "vms", vm.ID)
	os.RemoveAll(vmDir)

	vm.State = VMStateStopped
	return nil
}

// GetVM returns a VM by ID
func (m *Manager) GetVM(vmID string) (*VM, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	vm, exists := m.vms[vmID]
	if !exists {
		return nil, fmt.Errorf("VM %s not found", vmID)
	}

	return vm, nil
}

// ListVMs returns all VMs
func (m *Manager) ListVMs() []*VM {
	m.mu.RLock()
	defer m.mu.RUnlock()

	vms := make([]*VM, 0, len(m.vms))
	for _, vm := range m.vms {
		vms = append(vms, vm)
	}
	return vms
}

// Cleanup stops all VMs and cleans up resources
func (m *Manager) Cleanup() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	var lastErr error
	for _, vm := range m.vms {
		if err := m.stopVM(vm); err != nil {
			lastErr = err
		}
	}

	return lastErr
}

// ExecuteFunction executes a function in a VM and returns the result
func (m *Manager) ExecuteFunction(ctx context.Context, vm *VM, payload []byte) ([]byte, error) {
	// The VM runs a small HTTP server that receives function invocations
	// We send the payload to this server and wait for the response
	
	client := &http.Client{
		Timeout: time.Duration(30) * time.Second,
	}

	url := fmt.Sprintf("http://%s:8080/invoke", vm.IPAddress)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to invoke function: %w", err)
	}
	defer resp.Body.Close()

	return io.ReadAll(resp.Body)
}

// apiCall makes an API call to the Firecracker socket
func (m *Manager) apiCall(socketPath, method, path string, body interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(data)
	}

	// Create HTTP client with Unix socket transport
	client := &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				return net.Dial("unix", socketPath)
			},
		},
		Timeout: 10 * time.Second,
	}

	req, err := http.NewRequest(method, "http://localhost"+path, bodyReader)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
