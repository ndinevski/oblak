package models

import (
	"fmt"
	"time"
)

// VMStatus represents the current state of a virtual machine
type VMStatus string

const (
	VMStatusRunning  VMStatus = "running"
	VMStatusStopped  VMStatus = "stopped"
	VMStatusPaused   VMStatus = "paused"
	VMStatusStarting VMStatus = "starting"
	VMStatusStopping VMStatus = "stopping"
	VMStatusUnknown  VMStatus = "unknown"
)

// OSType represents the operating system type
type OSType string

const (
	OSTypeLinux   OSType = "linux"
	OSTypeWindows OSType = "windows"
	OSTypeOther   OSType = "other"
)

// VirtualMachine represents a virtual machine instance
type VirtualMachine struct {
	ID          string   `json:"id"`   // Unique identifier (VMID in Proxmox)
	Name        string   `json:"name"` // Display name
	Description string   `json:"description,omitempty"`
	Status      VMStatus `json:"status"`
	Node        string   `json:"node"`               // Proxmox node name
	Template    string   `json:"template,omitempty"` // Template used to create this VM

	// Hardware configuration
	Cores    int `json:"cores"`     // Number of CPU cores
	Memory   int `json:"memory"`    // Memory in MB
	DiskSize int `json:"disk_size"` // Primary disk size in GB

	// Operating system
	OSType     OSType `json:"os_type"`
	OSTemplate string `json:"os_template,omitempty"` // OS template/ISO name

	// Networking
	IPAddress   string `json:"ip_address,omitempty"`
	IPv6Address string `json:"ipv6_address,omitempty"`
	MACAddress  string `json:"mac_address,omitempty"`
	Network     string `json:"network,omitempty"` // Network bridge name

	// Cloud-init configuration
	CloudInit *CloudInitConfig `json:"cloud_init,omitempty"`

	// Tags and metadata
	Tags     []string          `json:"tags,omitempty"`
	Metadata map[string]string `json:"metadata,omitempty"`

	// Resource usage (runtime info)
	CPUUsage   float64 `json:"cpu_usage,omitempty"`   // CPU usage percentage
	MemoryUsed int64   `json:"memory_used,omitempty"` // Memory used in bytes
	DiskRead   int64   `json:"disk_read,omitempty"`   // Disk read bytes
	DiskWrite  int64   `json:"disk_write,omitempty"`  // Disk write bytes
	NetIn      int64   `json:"net_in,omitempty"`      // Network bytes in
	NetOut     int64   `json:"net_out,omitempty"`     // Network bytes out
	Uptime     int64   `json:"uptime,omitempty"`      // Uptime in seconds

	// Timestamps
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// CloudInitConfig represents cloud-init configuration for a VM
type CloudInitConfig struct {
	User         string   `json:"user,omitempty"`         // Default user
	Password     string   `json:"password,omitempty"`     // Password (hashed in storage)
	SSHKeys      []string `json:"ssh_keys,omitempty"`     // SSH public keys
	IPConfig     string   `json:"ip_config,omitempty"`    // IP configuration (dhcp or static)
	Gateway      string   `json:"gateway,omitempty"`      // Default gateway
	DNS          []string `json:"dns,omitempty"`          // DNS servers
	Searchdomain string   `json:"searchdomain,omitempty"` // Search domain
	UserData     string   `json:"user_data,omitempty"`    // Custom user-data script
}

// VMTemplate represents an available VM template
type VMTemplate struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	OSType      OSType    `json:"os_type"`
	Node        string    `json:"node"`
	DiskSize    int       `json:"disk_size"` // Template disk size in GB
	CreatedAt   time.Time `json:"created_at,omitempty"`
}

// VMSize represents a predefined VM size configuration
type VMSize struct {
	Name        string `json:"name"` // e.g., "small", "medium", "large"
	Cores       int    `json:"cores"`
	Memory      int    `json:"memory"`    // Memory in MB
	DiskSize    int    `json:"disk_size"` // Disk size in GB
	Description string `json:"description,omitempty"`
}

// PredefinedSizes contains available VM sizes
var PredefinedSizes = []VMSize{
	{Name: "nano", Cores: 1, Memory: 256, DiskSize: 5, Description: "Nano instance: 1 vCPU, 256MB RAM, 5GB disk"},
	{Name: "micro", Cores: 1, Memory: 512, DiskSize: 10, Description: "Micro instance: 1 vCPU, 512MB RAM, 10GB disk"},
	{Name: "small", Cores: 1, Memory: 1024, DiskSize: 20, Description: "Small instance: 1 vCPU, 1GB RAM, 20GB disk"},
	{Name: "medium", Cores: 2, Memory: 2048, DiskSize: 40, Description: "Medium instance: 2 vCPUs, 2GB RAM, 40GB disk"},
	{Name: "large", Cores: 4, Memory: 4096, DiskSize: 80, Description: "Large instance: 4 vCPUs, 4GB RAM, 80GB disk"},
	{Name: "xlarge", Cores: 8, Memory: 8192, DiskSize: 160, Description: "XLarge instance: 8 vCPUs, 8GB RAM, 160GB disk"},
	{Name: "xxlarge", Cores: 16, Memory: 16384, DiskSize: 320, Description: "XXLarge instance: 16 vCPUs, 16GB RAM, 320GB disk"},
}

// GetSizeByName returns a VMSize by name
func GetSizeByName(name string) *VMSize {
	for _, size := range PredefinedSizes {
		if size.Name == name {
			return &size
		}
	}
	return nil
}

// CreateVMRequest is the request body for creating a VM
type CreateVMRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`

	// Either use a template...
	Template string `json:"template,omitempty"`

	// ...or specify OS details
	OSType     OSType `json:"os_type,omitempty"`
	OSTemplate string `json:"os_template,omitempty"` // ISO or cloud image name

	// Hardware - either use a size name or specify custom values
	Size     string `json:"size,omitempty"`      // e.g., "small", "medium", "large"
	Cores    int    `json:"cores,omitempty"`     // Custom cores (overrides size)
	Memory   int    `json:"memory,omitempty"`    // Custom memory in MB (overrides size)
	DiskSize int    `json:"disk_size,omitempty"` // Custom disk size in GB (overrides size)

	// Node selection
	Node string `json:"node,omitempty"` // Specific node (optional)

	// Networking
	Network  string `json:"network,omitempty"`   // Network bridge (default: vmbr0)
	IPConfig string `json:"ip_config,omitempty"` // "dhcp" or "ip=x.x.x.x/24,gw=x.x.x.x"

	// Cloud-init
	CloudInit *CloudInitConfig `json:"cloud_init,omitempty"`

	// Tags and metadata
	Tags     []string          `json:"tags,omitempty"`
	Metadata map[string]string `json:"metadata,omitempty"`

	// Start VM after creation
	StartOnCreate bool `json:"start_on_create,omitempty"`
}

// Validate validates the CreateVMRequest
func (r *CreateVMRequest) Validate() error {
	if r.Name == "" {
		return &ValidationError{Field: "name", Message: "name is required"}
	}
	if len(r.Name) < 2 || len(r.Name) > 63 {
		return &ValidationError{Field: "name", Message: "name must be between 2 and 63 characters"}
	}

	// Must have either a template or OS specification
	if r.Template == "" && r.OSTemplate == "" {
		return &ValidationError{Field: "template", Message: "either template or os_template is required"}
	}

	// Validate size or custom resources
	if r.Size != "" {
		if GetSizeByName(r.Size) == nil {
			return &ValidationError{Field: "size", Message: fmt.Sprintf("invalid size: %s", r.Size)}
		}
		// Apply size values for validation
		r.ApplySize()
	} else {
		// Custom resources - set defaults if not specified
		if r.Cores == 0 {
			r.Cores = 1
		}
		if r.Memory == 0 {
			r.Memory = 1024
		}
		if r.DiskSize == 0 {
			r.DiskSize = 20
		}
	}

	// Validate resource limits
	if r.Cores < 1 || r.Cores > 128 {
		return &ValidationError{Field: "cores", Message: "cores must be between 1 and 128"}
	}
	if r.Memory < 256 || r.Memory > 524288 {
		return &ValidationError{Field: "memory", Message: "memory must be between 256MB and 512GB"}
	}
	if r.DiskSize < 1 || r.DiskSize > 10240 {
		return &ValidationError{Field: "disk_size", Message: "disk_size must be between 1GB and 10TB"}
	}

	return nil
}

// ApplySize applies a predefined size to the request
func (r *CreateVMRequest) ApplySize() {
	if r.Size != "" {
		size := GetSizeByName(r.Size)
		if size != nil {
			if r.Cores == 0 {
				r.Cores = size.Cores
			}
			if r.Memory == 0 {
				r.Memory = size.Memory
			}
			if r.DiskSize == 0 {
				r.DiskSize = size.DiskSize
			}
		}
	}
}

// UpdateVMRequest is the request body for updating a VM
type UpdateVMRequest struct {
	Name        *string           `json:"name,omitempty"`
	Description *string           `json:"description,omitempty"`
	Cores       *int              `json:"cores,omitempty"`
	Memory      *int              `json:"memory,omitempty"`
	Tags        []string          `json:"tags,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

// ResizeVMRequest is the request body for resizing a VM
type ResizeVMRequest struct {
	Size     string `json:"size,omitempty"`      // Predefined size name
	Cores    *int   `json:"cores,omitempty"`     // Custom cores
	Memory   *int   `json:"memory,omitempty"`    // Custom memory in MB
	DiskSize *int   `json:"disk_size,omitempty"` // Increase disk size (cannot decrease)
}

// VMAction represents an action to perform on a VM
type VMAction string

const (
	ActionStart    VMAction = "start"
	ActionStop     VMAction = "stop"
	ActionReboot   VMAction = "reboot"
	ActionShutdown VMAction = "shutdown" // Graceful shutdown
	ActionReset    VMAction = "reset"    // Hard reset
	ActionSuspend  VMAction = "suspend"
	ActionResume   VMAction = "resume"
	ActionSnapshot VMAction = "snapshot"
	ActionClone    VMAction = "clone"
)

// VMActionRequest is the request body for performing an action on a VM
type VMActionRequest struct {
	Action       VMAction `json:"action"`
	Force        bool     `json:"force,omitempty"`         // Force stop/shutdown
	SnapshotName string   `json:"snapshot_name,omitempty"` // For snapshot action
	CloneName    string   `json:"clone_name,omitempty"`    // For clone action
}

// Validate validates the VMActionRequest
func (r *VMActionRequest) Validate() error {
	if r.Action == "" {
		return &ValidationError{Field: "action", Message: "action is required"}
	}

	validActions := map[VMAction]bool{
		ActionStart: true, ActionStop: true, ActionReboot: true,
		ActionShutdown: true, ActionReset: true, ActionSuspend: true,
		ActionResume: true, ActionSnapshot: true, ActionClone: true,
	}

	if !validActions[r.Action] {
		return &ValidationError{Field: "action", Message: fmt.Sprintf("invalid action: %s", r.Action)}
	}

	if r.Action == ActionSnapshot && r.SnapshotName == "" {
		return &ValidationError{Field: "snapshot_name", Message: "snapshot_name is required for snapshot action"}
	}

	if r.Action == ActionClone && r.CloneName == "" {
		return &ValidationError{Field: "clone_name", Message: "clone_name is required for clone action"}
	}

	return nil
}

// Snapshot represents a VM snapshot
type Snapshot struct {
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	VMID        string    `json:"vmid"`
	Parent      string    `json:"parent,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	VMState     bool      `json:"vm_state"` // Whether RAM state is included
}

// CreateSnapshotRequest is the request body for creating a snapshot
type CreateSnapshotRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	IncludeRAM  bool   `json:"include_ram,omitempty"` // Include VM memory state
}

// Validate validates the CreateSnapshotRequest
func (r *CreateSnapshotRequest) Validate() error {
	if r.Name == "" {
		return &ValidationError{Field: "name", Message: "name is required"}
	}
	return nil
}

// Console represents VM console access information
type Console struct {
	Type     string `json:"type"` // "vnc", "spice", or "serial"
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Password string `json:"password,omitempty"`
	Ticket   string `json:"ticket,omitempty"`
	URL      string `json:"url,omitempty"` // WebSocket URL for noVNC
}

// ValidationError represents a validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}
