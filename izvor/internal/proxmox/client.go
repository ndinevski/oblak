package proxmox

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/oblak/izvor/internal/models"
)

// Config holds the Proxmox client configuration
type Config struct {
	URL                string
	User               string
	Password           string
	TokenID            string // API token ID (user@realm!tokenid)
	TokenSecret        string // API token secret
	DefaultNode        string
	InsecureSkipVerify bool
}

// Client is a Proxmox API client
type Client struct {
	config     Config
	httpClient *http.Client
	ticket     string
	csrfToken  string
	ticketExp  time.Time
}

// NewClient creates a new Proxmox client
func NewClient(config Config) (*Client, error) {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: config.InsecureSkipVerify,
		},
	}

	client := &Client{
		config: config,
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   60 * time.Second,
		},
	}

	// If using password authentication, get a ticket
	if config.Password != "" && config.TokenID == "" {
		if err := client.authenticate(); err != nil {
			return nil, fmt.Errorf("failed to authenticate: %w", err)
		}
	}

	return client, nil
}

// authenticate gets an authentication ticket from Proxmox
func (c *Client) authenticate() error {
	data := url.Values{}
	data.Set("username", c.config.User)
	data.Set("password", c.config.Password)

	resp, err := c.httpClient.PostForm(c.config.URL+"/api2/json/access/ticket", data)
	if err != nil {
		return fmt.Errorf("authentication request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("authentication failed with status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data struct {
			Ticket              string `json:"ticket"`
			CSRFPreventionToken string `json:"CSRFPreventionToken"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to decode authentication response: %w", err)
	}

	c.ticket = result.Data.Ticket
	c.csrfToken = result.Data.CSRFPreventionToken
	c.ticketExp = time.Now().Add(2 * time.Hour) // Tickets typically valid for 2 hours

	return nil
}

// doRequest performs an authenticated API request
func (c *Client) doRequest(ctx context.Context, method, path string, body interface{}) ([]byte, error) {
	// Re-authenticate if ticket expired
	if c.config.Password != "" && c.config.TokenID == "" {
		if time.Now().After(c.ticketExp) {
			if err := c.authenticate(); err != nil {
				return nil, err
			}
		}
	}

	var reqBody io.Reader
	if body != nil {
		switch v := body.(type) {
		case url.Values:
			reqBody = strings.NewReader(v.Encode())
		default:
			jsonBody, err := json.Marshal(body)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal request body: %w", err)
			}
			reqBody = bytes.NewReader(jsonBody)
		}
	}

	req, err := http.NewRequestWithContext(ctx, method, c.config.URL+"/api2/json"+path, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set authentication
	if c.config.TokenID != "" {
		req.Header.Set("Authorization", fmt.Sprintf("PVEAPIToken=%s=%s", c.config.TokenID, c.config.TokenSecret))
	} else {
		req.AddCookie(&http.Cookie{Name: "PVEAuthCookie", Value: c.ticket})
		if method != "GET" {
			req.Header.Set("CSRFPreventionToken", c.csrfToken)
		}
	}

	if body != nil {
		if _, ok := body.(url.Values); ok {
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		} else {
			req.Header.Set("Content-Type", "application/json")
		}
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// GetDefaultNode returns the default node or discovers one
func (c *Client) GetDefaultNode(ctx context.Context) (string, error) {
	if c.config.DefaultNode != "" {
		return c.config.DefaultNode, nil
	}

	nodes, err := c.ListNodes(ctx)
	if err != nil {
		return "", err
	}

	if len(nodes) == 0 {
		return "", fmt.Errorf("no nodes available")
	}

	// Return first online node
	for _, node := range nodes {
		if node.Status == "online" {
			return node.Name, nil
		}
	}

	return nodes[0].Name, nil
}

// HealthCheck verifies connectivity to Proxmox
func (c *Client) HealthCheck(ctx context.Context) error {
	_, err := c.doRequest(ctx, "GET", "/version", nil)
	return err
}

// GetVersion returns the Proxmox version
func (c *Client) GetVersion(ctx context.Context) (string, error) {
	body, err := c.doRequest(ctx, "GET", "/version", nil)
	if err != nil {
		return "", err
	}

	var result struct {
		Data struct {
			Version string `json:"version"`
			Release string `json:"release"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	return result.Data.Version, nil
}

// ===== Node Operations =====

// ListNodes returns all nodes in the cluster
func (c *Client) ListNodes(ctx context.Context) ([]models.Node, error) {
	body, err := c.doRequest(ctx, "GET", "/nodes", nil)
	if err != nil {
		return nil, err
	}

	var result struct {
		Data []struct {
			Node    string  `json:"node"`
			Status  string  `json:"status"`
			CPU     float64 `json:"cpu"`
			MaxCPU  int     `json:"maxcpu"`
			Mem     int64   `json:"mem"`
			MaxMem  int64   `json:"maxmem"`
			Disk    int64   `json:"disk"`
			MaxDisk int64   `json:"maxdisk"`
			Uptime  int64   `json:"uptime"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	nodes := make([]models.Node, len(result.Data))
	for i, n := range result.Data {
		nodes[i] = models.Node{
			Name:        n.Node,
			Status:      n.Status,
			Cores:       n.MaxCPU,
			Memory:      n.MaxMem,
			MemoryUsed:  n.Mem,
			DiskTotal:   n.MaxDisk,
			DiskUsed:    n.Disk,
			CPUUsage:    n.CPU * 100,
			MemoryUsage: float64(n.Mem) / float64(n.MaxMem) * 100,
			Uptime:      n.Uptime,
		}
	}

	return nodes, nil
}

// ===== VM Operations =====

// ListVMs returns all VMs across all nodes or on a specific node
func (c *Client) ListVMs(ctx context.Context, node string) ([]models.VirtualMachine, error) {
	var nodes []string
	if node != "" {
		nodes = []string{node}
	} else {
		nodeList, err := c.ListNodes(ctx)
		if err != nil {
			return nil, err
		}
		for _, n := range nodeList {
			nodes = append(nodes, n.Name)
		}
	}

	var allVMs []models.VirtualMachine
	for _, n := range nodes {
		body, err := c.doRequest(ctx, "GET", fmt.Sprintf("/nodes/%s/qemu", n), nil)
		if err != nil {
			continue // Skip nodes we can't access
		}

		var result struct {
			Data []struct {
				VMID      int     `json:"vmid"`
				Name      string  `json:"name"`
				Status    string  `json:"status"`
				CPU       float64 `json:"cpu"`
				Mem       int64   `json:"mem"`
				MaxMem    int64   `json:"maxmem"`
				Disk      int64   `json:"disk"`
				MaxDisk   int64   `json:"maxdisk"`
				NetIn     int64   `json:"netin"`
				NetOut    int64   `json:"netout"`
				DiskRead  int64   `json:"diskread"`
				DiskWrite int64   `json:"diskwrite"`
				Uptime    int64   `json:"uptime"`
				Template  int     `json:"template"`
				Tags      string  `json:"tags"`
			} `json:"data"`
		}

		if err := json.Unmarshal(body, &result); err != nil {
			continue
		}

		for _, vm := range result.Data {
			if vm.Template == 1 {
				continue // Skip templates
			}

			var tags []string
			if vm.Tags != "" {
				tags = strings.Split(vm.Tags, ";")
			}

			allVMs = append(allVMs, models.VirtualMachine{
				ID:         strconv.Itoa(vm.VMID),
				Name:       vm.Name,
				Status:     parseVMStatus(vm.Status),
				Node:       n,
				Memory:     int(vm.MaxMem / 1024 / 1024), // Convert to MB
				CPUUsage:   vm.CPU * 100,
				MemoryUsed: vm.Mem,
				NetIn:      vm.NetIn,
				NetOut:     vm.NetOut,
				DiskRead:   vm.DiskRead,
				DiskWrite:  vm.DiskWrite,
				Uptime:     vm.Uptime,
				Tags:       tags,
			})
		}
	}

	return allVMs, nil
}

// GetVM returns a specific VM by ID
func (c *Client) GetVM(ctx context.Context, node, vmid string) (*models.VirtualMachine, error) {
	// Get VM status
	body, err := c.doRequest(ctx, "GET", fmt.Sprintf("/nodes/%s/qemu/%s/status/current", node, vmid), nil)
	if err != nil {
		return nil, err
	}

	var statusResult struct {
		Data struct {
			VMID      int     `json:"vmid"`
			Name      string  `json:"name"`
			Status    string  `json:"status"`
			CPU       float64 `json:"cpu"`
			CPUs      int     `json:"cpus"`
			Mem       int64   `json:"mem"`
			MaxMem    int64   `json:"maxmem"`
			Disk      int64   `json:"disk"`
			MaxDisk   int64   `json:"maxdisk"`
			NetIn     int64   `json:"netin"`
			NetOut    int64   `json:"netout"`
			DiskRead  int64   `json:"diskread"`
			DiskWrite int64   `json:"diskwrite"`
			Uptime    int64   `json:"uptime"`
			Tags      string  `json:"tags"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &statusResult); err != nil {
		return nil, err
	}

	// Get VM config for more details
	configBody, err := c.doRequest(ctx, "GET", fmt.Sprintf("/nodes/%s/qemu/%s/config", node, vmid), nil)
	if err != nil {
		return nil, err
	}

	var configResult struct {
		Data map[string]interface{} `json:"data"`
	}

	if err := json.Unmarshal(configBody, &configResult); err != nil {
		return nil, err
	}

	var tags []string
	if statusResult.Data.Tags != "" {
		tags = strings.Split(statusResult.Data.Tags, ";")
	}

	vm := &models.VirtualMachine{
		ID:         strconv.Itoa(statusResult.Data.VMID),
		Name:       statusResult.Data.Name,
		Status:     parseVMStatus(statusResult.Data.Status),
		Node:       node,
		Cores:      statusResult.Data.CPUs,
		Memory:     int(statusResult.Data.MaxMem / 1024 / 1024),
		CPUUsage:   statusResult.Data.CPU * 100,
		MemoryUsed: statusResult.Data.Mem,
		NetIn:      statusResult.Data.NetIn,
		NetOut:     statusResult.Data.NetOut,
		DiskRead:   statusResult.Data.DiskRead,
		DiskWrite:  statusResult.Data.DiskWrite,
		Uptime:     statusResult.Data.Uptime,
		Tags:       tags,
	}

	// Extract description from config
	if desc, ok := configResult.Data["description"].(string); ok {
		vm.Description = desc
	}

	// Extract network info
	if net0, ok := configResult.Data["net0"].(string); ok {
		vm.Network = parseNetworkConfig(net0)
	}

	// Extract IP address from cloud-init config or agent
	if ipconfig0, ok := configResult.Data["ipconfig0"].(string); ok {
		vm.IPAddress = parseIPConfig(ipconfig0)
	}

	return vm, nil
}

// CreateVM creates a new virtual machine
func (c *Client) CreateVM(ctx context.Context, req *models.CreateVMRequest) (*models.VirtualMachine, string, error) {
	node := req.Node
	if node == "" {
		var err error
		node, err = c.GetDefaultNode(ctx)
		if err != nil {
			return nil, "", err
		}
	}

	// Get next available VMID
	vmid, err := c.getNextVMID(ctx)
	if err != nil {
		return nil, "", err
	}

	// Apply size defaults
	req.ApplySize()

	// Build VM creation parameters
	params := url.Values{}
	params.Set("vmid", vmid)
	params.Set("name", req.Name)
	params.Set("cores", strconv.Itoa(req.Cores))
	params.Set("memory", strconv.Itoa(req.Memory))
	params.Set("ostype", string(req.OSType))

	if req.Description != "" {
		params.Set("description", req.Description)
	}

	// Network configuration
	network := req.Network
	if network == "" {
		network = "vmbr0"
	}
	params.Set("net0", fmt.Sprintf("virtio,bridge=%s", network))

	// Storage - use local-lvm by default
	params.Set("scsi0", fmt.Sprintf("local-lvm:%d", req.DiskSize))
	params.Set("scsihw", "virtio-scsi-pci")
	params.Set("boot", "order=scsi0")

	// If using a template, clone it instead
	if req.Template != "" {
		return c.cloneVM(ctx, node, req.Template, vmid, req)
	}

	// Cloud-init configuration
	if req.CloudInit != nil {
		params.Set("ide2", "local-lvm:cloudinit")

		if req.CloudInit.User != "" {
			params.Set("ciuser", req.CloudInit.User)
		}
		if req.CloudInit.Password != "" {
			params.Set("cipassword", req.CloudInit.Password)
		}
		if len(req.CloudInit.SSHKeys) > 0 {
			params.Set("sshkeys", url.QueryEscape(strings.Join(req.CloudInit.SSHKeys, "\n")))
		}
		if req.CloudInit.IPConfig != "" {
			params.Set("ipconfig0", req.CloudInit.IPConfig)
		} else {
			params.Set("ipconfig0", "ip=dhcp")
		}
	}

	// Tags
	if len(req.Tags) > 0 {
		params.Set("tags", strings.Join(req.Tags, ";"))
	}

	// Create the VM
	body, err := c.doRequest(ctx, "POST", fmt.Sprintf("/nodes/%s/qemu", node), params)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create VM: %w", err)
	}

	// Extract task ID (UPID)
	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, "", err
	}

	// Wait for task to complete
	if err := c.waitForTask(ctx, node, result.Data); err != nil {
		return nil, "", fmt.Errorf("VM creation task failed: %w", err)
	}

	// Start VM if requested
	if req.StartOnCreate {
		if _, err := c.StartVM(ctx, node, vmid); err != nil {
			// Log but don't fail - VM was created successfully
			fmt.Printf("Warning: failed to start VM after creation: %v\n", err)
		}
	}

	// Get the created VM
	vm, err := c.GetVM(ctx, node, vmid)
	if err != nil {
		return nil, "", err
	}

	return vm, vmid, nil
}

// cloneVM clones a template to create a new VM
func (c *Client) cloneVM(ctx context.Context, node, template, newVMID string, req *models.CreateVMRequest) (*models.VirtualMachine, string, error) {
	// Find the template VMID
	templateVMID := template
	// If template is a name, find its VMID
	vms, err := c.ListVMs(ctx, node)
	if err == nil {
		for _, vm := range vms {
			if vm.Name == template {
				templateVMID = vm.ID
				break
			}
		}
	}

	params := url.Values{}
	params.Set("newid", newVMID)
	params.Set("name", req.Name)
	params.Set("full", "1") // Full clone, not linked

	if req.Description != "" {
		params.Set("description", req.Description)
	}

	body, err := c.doRequest(ctx, "POST", fmt.Sprintf("/nodes/%s/qemu/%s/clone", node, templateVMID), params)
	if err != nil {
		return nil, "", fmt.Errorf("failed to clone template: %w", err)
	}

	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, "", err
	}

	// Wait for clone task
	if err := c.waitForTask(ctx, node, result.Data); err != nil {
		return nil, "", fmt.Errorf("clone task failed: %w", err)
	}

	// Update VM config if resources differ from template
	updateParams := url.Values{}
	if req.Cores > 0 {
		updateParams.Set("cores", strconv.Itoa(req.Cores))
	}
	if req.Memory > 0 {
		updateParams.Set("memory", strconv.Itoa(req.Memory))
	}
	if len(updateParams) > 0 {
		_, err = c.doRequest(ctx, "PUT", fmt.Sprintf("/nodes/%s/qemu/%s/config", node, newVMID), updateParams)
		if err != nil {
			fmt.Printf("Warning: failed to update cloned VM config: %v\n", err)
		}
	}

	// Start if requested
	if req.StartOnCreate {
		if _, err := c.StartVM(ctx, node, newVMID); err != nil {
			fmt.Printf("Warning: failed to start VM after clone: %v\n", err)
		}
	}

	vm, err := c.GetVM(ctx, node, newVMID)
	if err != nil {
		return nil, "", err
	}

	return vm, newVMID, nil
}

// DeleteVM deletes a virtual machine
func (c *Client) DeleteVM(ctx context.Context, node, vmid string) error {
	// Stop VM first if running
	vm, err := c.GetVM(ctx, node, vmid)
	if err != nil {
		return err
	}

	if vm.Status == models.VMStatusRunning {
		if _, err := c.StopVM(ctx, node, vmid, true); err != nil {
			return fmt.Errorf("failed to stop VM before deletion: %w", err)
		}
		// Wait for VM to stop
		time.Sleep(2 * time.Second)
	}

	body, err := c.doRequest(ctx, "DELETE", fmt.Sprintf("/nodes/%s/qemu/%s", node, vmid), nil)
	if err != nil {
		return err
	}

	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return err
	}

	return c.waitForTask(ctx, node, result.Data)
}

// StartVM starts a virtual machine
func (c *Client) StartVM(ctx context.Context, node, vmid string) (string, error) {
	body, err := c.doRequest(ctx, "POST", fmt.Sprintf("/nodes/%s/qemu/%s/status/start", node, vmid), nil)
	if err != nil {
		return "", err
	}

	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	return result.Data, nil
}

// StopVM stops a virtual machine
func (c *Client) StopVM(ctx context.Context, node, vmid string, force bool) (string, error) {
	endpoint := "shutdown"
	if force {
		endpoint = "stop"
	}

	body, err := c.doRequest(ctx, "POST", fmt.Sprintf("/nodes/%s/qemu/%s/status/%s", node, vmid, endpoint), nil)
	if err != nil {
		return "", err
	}

	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	return result.Data, nil
}

// RebootVM reboots a virtual machine
func (c *Client) RebootVM(ctx context.Context, node, vmid string) (string, error) {
	body, err := c.doRequest(ctx, "POST", fmt.Sprintf("/nodes/%s/qemu/%s/status/reboot", node, vmid), nil)
	if err != nil {
		return "", err
	}

	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	return result.Data, nil
}

// ResetVM hard resets a virtual machine
func (c *Client) ResetVM(ctx context.Context, node, vmid string) (string, error) {
	body, err := c.doRequest(ctx, "POST", fmt.Sprintf("/nodes/%s/qemu/%s/status/reset", node, vmid), nil)
	if err != nil {
		return "", err
	}

	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	return result.Data, nil
}

// SuspendVM suspends a virtual machine
func (c *Client) SuspendVM(ctx context.Context, node, vmid string) (string, error) {
	body, err := c.doRequest(ctx, "POST", fmt.Sprintf("/nodes/%s/qemu/%s/status/suspend", node, vmid), nil)
	if err != nil {
		return "", err
	}

	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	return result.Data, nil
}

// ResumeVM resumes a suspended virtual machine
func (c *Client) ResumeVM(ctx context.Context, node, vmid string) (string, error) {
	body, err := c.doRequest(ctx, "POST", fmt.Sprintf("/nodes/%s/qemu/%s/status/resume", node, vmid), nil)
	if err != nil {
		return "", err
	}

	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	return result.Data, nil
}

// ===== Snapshot Operations =====

// ListSnapshots returns all snapshots for a VM
func (c *Client) ListSnapshots(ctx context.Context, node, vmid string) ([]models.Snapshot, error) {
	body, err := c.doRequest(ctx, "GET", fmt.Sprintf("/nodes/%s/qemu/%s/snapshot", node, vmid), nil)
	if err != nil {
		return nil, err
	}

	var result struct {
		Data []struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Parent      string `json:"parent"`
			Snaptime    int64  `json:"snaptime"`
			VMState     int    `json:"vmstate"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	snapshots := make([]models.Snapshot, 0)
	for _, s := range result.Data {
		if s.Name == "current" {
			continue // Skip the "current" pseudo-snapshot
		}
		snapshots = append(snapshots, models.Snapshot{
			Name:        s.Name,
			Description: s.Description,
			VMID:        vmid,
			Parent:      s.Parent,
			CreatedAt:   time.Unix(s.Snaptime, 0),
			VMState:     s.VMState == 1,
		})
	}

	return snapshots, nil
}

// CreateSnapshot creates a new snapshot
func (c *Client) CreateSnapshot(ctx context.Context, node, vmid string, req *models.CreateSnapshotRequest) (*models.Snapshot, error) {
	params := url.Values{}
	params.Set("snapname", req.Name)
	if req.Description != "" {
		params.Set("description", req.Description)
	}
	if req.IncludeRAM {
		params.Set("vmstate", "1")
	}

	body, err := c.doRequest(ctx, "POST", fmt.Sprintf("/nodes/%s/qemu/%s/snapshot", node, vmid), params)
	if err != nil {
		return nil, err
	}

	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	// Wait for snapshot task
	if err := c.waitForTask(ctx, node, result.Data); err != nil {
		return nil, fmt.Errorf("snapshot creation failed: %w", err)
	}

	return &models.Snapshot{
		Name:        req.Name,
		Description: req.Description,
		VMID:        vmid,
		CreatedAt:   time.Now(),
		VMState:     req.IncludeRAM,
	}, nil
}

// DeleteSnapshot deletes a snapshot
func (c *Client) DeleteSnapshot(ctx context.Context, node, vmid, snapname string) error {
	body, err := c.doRequest(ctx, "DELETE", fmt.Sprintf("/nodes/%s/qemu/%s/snapshot/%s", node, vmid, snapname), nil)
	if err != nil {
		return err
	}

	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return err
	}

	return c.waitForTask(ctx, node, result.Data)
}

// RollbackSnapshot rolls back a VM to a snapshot
func (c *Client) RollbackSnapshot(ctx context.Context, node, vmid, snapname string) error {
	body, err := c.doRequest(ctx, "POST", fmt.Sprintf("/nodes/%s/qemu/%s/snapshot/%s/rollback", node, vmid, snapname), nil)
	if err != nil {
		return err
	}

	var result struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return err
	}

	return c.waitForTask(ctx, node, result.Data)
}

// ===== Console Operations =====

// GetVNCConsole gets VNC console access for a VM
func (c *Client) GetVNCConsole(ctx context.Context, node, vmid string) (*models.Console, error) {
	body, err := c.doRequest(ctx, "POST", fmt.Sprintf("/nodes/%s/qemu/%s/vncproxy", node, vmid), nil)
	if err != nil {
		return nil, err
	}

	var result struct {
		Data struct {
			Ticket string `json:"ticket"`
			Port   int    `json:"port"`
			User   string `json:"user"`
			Upid   string `json:"upid"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	return &models.Console{
		Type:   "vnc",
		Host:   c.config.URL,
		Port:   result.Data.Port,
		Ticket: result.Data.Ticket,
		URL:    fmt.Sprintf("%s/?console=kvm&novnc=1&vmid=%s&node=%s", c.config.URL, vmid, node),
	}, nil
}

// ===== Template Operations =====

// ListTemplates returns all VM templates
func (c *Client) ListTemplates(ctx context.Context) ([]models.VMTemplate, error) {
	nodes, err := c.ListNodes(ctx)
	if err != nil {
		return nil, err
	}

	var templates []models.VMTemplate
	for _, node := range nodes {
		body, err := c.doRequest(ctx, "GET", fmt.Sprintf("/nodes/%s/qemu", node.Name), nil)
		if err != nil {
			continue
		}

		var result struct {
			Data []struct {
				VMID     int    `json:"vmid"`
				Name     string `json:"name"`
				Template int    `json:"template"`
				MaxDisk  int64  `json:"maxdisk"`
			} `json:"data"`
		}

		if err := json.Unmarshal(body, &result); err != nil {
			continue
		}

		for _, vm := range result.Data {
			if vm.Template == 1 {
				templates = append(templates, models.VMTemplate{
					ID:       strconv.Itoa(vm.VMID),
					Name:     vm.Name,
					Node:     node.Name,
					DiskSize: int(vm.MaxDisk / 1024 / 1024 / 1024),
				})
			}
		}
	}

	return templates, nil
}

// ===== Storage Operations =====

// ListStorages returns all storage pools
func (c *Client) ListStorages(ctx context.Context, node string) ([]models.Storage, error) {
	path := "/storage"
	if node != "" {
		path = fmt.Sprintf("/nodes/%s/storage", node)
	}

	body, err := c.doRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	var result struct {
		Data []struct {
			Storage string `json:"storage"`
			Type    string `json:"type"`
			Total   int64  `json:"total"`
			Used    int64  `json:"used"`
			Avail   int64  `json:"avail"`
			Content string `json:"content"`
			Shared  int    `json:"shared"`
			Enabled int    `json:"enabled"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	storages := make([]models.Storage, len(result.Data))
	for i, s := range result.Data {
		var usagePercent float64
		if s.Total > 0 {
			usagePercent = float64(s.Used) / float64(s.Total) * 100
		}

		storages[i] = models.Storage{
			Name:         s.Storage,
			Type:         s.Type,
			Node:         node,
			Total:        s.Total,
			Used:         s.Used,
			Available:    s.Avail,
			UsagePercent: usagePercent,
			Content:      strings.Split(s.Content, ","),
			Shared:       s.Shared == 1,
			Enabled:      s.Enabled == 1,
		}
	}

	return storages, nil
}

// ===== Network Operations =====

// ListNetworks returns all networks on a node
func (c *Client) ListNetworks(ctx context.Context, node string) ([]models.Network, error) {
	body, err := c.doRequest(ctx, "GET", fmt.Sprintf("/nodes/%s/network", node), nil)
	if err != nil {
		return nil, err
	}

	var result struct {
		Data []struct {
			Iface       string `json:"iface"`
			Type        string `json:"type"`
			Address     string `json:"address"`
			Netmask     string `json:"netmask"`
			Gateway     string `json:"gateway"`
			BridgePorts string `json:"bridge_ports"`
			Active      int    `json:"active"`
			VLAN        int    `json:"vlan-id"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	networks := make([]models.Network, 0)
	for _, n := range result.Data {
		if n.Type == "bridge" || n.Type == "bond" || n.Type == "vlan" {
			networks = append(networks, models.Network{
				Name:        n.Iface,
				Type:        n.Type,
				Node:        node,
				Address:     n.Address,
				Netmask:     n.Netmask,
				Gateway:     n.Gateway,
				BridgePorts: n.BridgePorts,
				Active:      n.Active == 1,
				VLAN:        n.VLAN,
			})
		}
	}

	return networks, nil
}

// ===== Task Operations =====

// GetTask returns task status
func (c *Client) GetTask(ctx context.Context, node, upid string) (*models.Task, error) {
	body, err := c.doRequest(ctx, "GET", fmt.Sprintf("/nodes/%s/tasks/%s/status", node, url.PathEscape(upid)), nil)
	if err != nil {
		return nil, err
	}

	var result struct {
		Data struct {
			Status     string `json:"status"`
			ExitStatus string `json:"exitstatus"`
			Type       string `json:"type"`
			User       string `json:"user"`
			StartTime  int64  `json:"starttime"`
			EndTime    int64  `json:"endtime"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	task := &models.Task{
		UPID:       upid,
		Node:       node,
		Type:       result.Data.Type,
		Status:     result.Data.Status,
		ExitStatus: result.Data.ExitStatus,
		User:       result.Data.User,
		StartTime:  time.Unix(result.Data.StartTime, 0),
	}

	if result.Data.EndTime > 0 {
		task.EndTime = time.Unix(result.Data.EndTime, 0)
	}

	return task, nil
}

// waitForTask waits for a task to complete
func (c *Client) waitForTask(ctx context.Context, node, upid string) error {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	timeout := time.After(5 * time.Minute)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timeout:
			return fmt.Errorf("task timeout")
		case <-ticker.C:
			task, err := c.GetTask(ctx, node, upid)
			if err != nil {
				return err
			}

			if task.Status == "stopped" {
				if task.ExitStatus == "OK" {
					return nil
				}
				return fmt.Errorf("task failed: %s", task.ExitStatus)
			}
		}
	}
}

// getNextVMID gets the next available VMID
func (c *Client) getNextVMID(ctx context.Context) (string, error) {
	body, err := c.doRequest(ctx, "GET", "/cluster/nextid", nil)
	if err != nil {
		return "", err
	}

	var result struct {
		Data string `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	return result.Data, nil
}

// ===== Helper Functions =====

func parseVMStatus(status string) models.VMStatus {
	switch status {
	case "running":
		return models.VMStatusRunning
	case "stopped":
		return models.VMStatusStopped
	case "paused":
		return models.VMStatusPaused
	default:
		return models.VMStatusUnknown
	}
}

func parseNetworkConfig(net0 string) string {
	parts := strings.Split(net0, ",")
	for _, part := range parts {
		if strings.HasPrefix(part, "bridge=") {
			return strings.TrimPrefix(part, "bridge=")
		}
	}
	return ""
}

func parseIPConfig(ipconfig string) string {
	parts := strings.Split(ipconfig, ",")
	for _, part := range parts {
		if strings.HasPrefix(part, "ip=") {
			ip := strings.TrimPrefix(part, "ip=")
			// Remove CIDR notation if present
			if idx := strings.Index(ip, "/"); idx != -1 {
				return ip[:idx]
			}
			return ip
		}
	}
	return ""
}
