package models

import "time"

// Node represents a Proxmox cluster node
type Node struct {
	Name   string `json:"name"`
	Status string `json:"status"` // "online", "offline"

	// Hardware info
	Cores      int   `json:"cores"`
	Memory     int64 `json:"memory"`      // Total memory in bytes
	MemoryUsed int64 `json:"memory_used"` // Used memory in bytes
	DiskTotal  int64 `json:"disk_total"`  // Total disk in bytes
	DiskUsed   int64 `json:"disk_used"`   // Used disk in bytes

	// Resource usage
	CPUUsage    float64 `json:"cpu_usage"`    // CPU usage percentage
	MemoryUsage float64 `json:"memory_usage"` // Memory usage percentage

	// VM counts
	VMCount    int `json:"vm_count"`
	RunningVMs int `json:"running_vms"`

	// Uptime
	Uptime int64 `json:"uptime"` // Uptime in seconds
}

// Storage represents a Proxmox storage pool
type Storage struct {
	Name string `json:"name"`
	Type string `json:"type"` // "lvm", "zfspool", "dir", "nfs", etc.
	Node string `json:"node"`

	Total        int64   `json:"total"`     // Total capacity in bytes
	Used         int64   `json:"used"`      // Used capacity in bytes
	Available    int64   `json:"available"` // Available capacity in bytes
	UsagePercent float64 `json:"usage_percent"`

	Content []string `json:"content"` // Allowed content types: "images", "rootdir", "vztmpl", etc.
	Shared  bool     `json:"shared"`  // Whether storage is shared across nodes
	Enabled bool     `json:"enabled"`
}

// Network represents a network configuration
type Network struct {
	Name string `json:"name"` // e.g., "vmbr0"
	Type string `json:"type"` // "bridge", "bond", "vlan", etc.
	Node string `json:"node"`

	Address string `json:"address,omitempty"`
	Netmask string `json:"netmask,omitempty"`
	Gateway string `json:"gateway,omitempty"`

	BridgePorts string `json:"bridge_ports,omitempty"` // Physical interfaces
	Active      bool   `json:"active"`

	// VLAN info
	VLAN int `json:"vlan,omitempty"`
}

// Task represents an async task in Proxmox
type Task struct {
	UPID        string    `json:"upid"` // Unique task ID
	Node        string    `json:"node"`
	Type        string    `json:"type"`        // Task type (qmcreate, qmstart, etc.)
	Status      string    `json:"status"`      // "running", "stopped"
	ExitStatus  string    `json:"exit_status"` // "OK", error message
	Progress    int       `json:"progress"`    // Progress percentage
	StartTime   time.Time `json:"start_time"`
	EndTime     time.Time `json:"end_time,omitempty"`
	User        string    `json:"user"`
	Description string    `json:"description,omitempty"`
}

// ISO represents an ISO image available for VM creation
type ISO struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`    // Size in bytes
	Storage string `json:"storage"` // Storage pool name
	Node    string `json:"node"`
}

// CloudImage represents a cloud-init compatible image
type CloudImage struct {
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	OSType      OSType    `json:"os_type"`
	Path        string    `json:"path"`
	Size        int64     `json:"size"`
	Storage     string    `json:"storage"`
	Node        string    `json:"node"`
	Format      string    `json:"format"` // "qcow2", "raw", etc.
	CreatedAt   time.Time `json:"created_at,omitempty"`
}

// ClusterStatus represents the Proxmox cluster status
type ClusterStatus struct {
	Name    string `json:"name"`
	Version int    `json:"version"`
	Quorate bool   `json:"quorate"`
	Nodes   int    `json:"nodes"`
}

// ResourceSummary represents a summary of cluster resources
type ResourceSummary struct {
	TotalCores   int   `json:"total_cores"`
	UsedCores    int   `json:"used_cores"`
	TotalMemory  int64 `json:"total_memory"`  // Total RAM in bytes
	UsedMemory   int64 `json:"used_memory"`   // Used RAM in bytes
	TotalStorage int64 `json:"total_storage"` // Total storage in bytes
	UsedStorage  int64 `json:"used_storage"`  // Used storage in bytes

	TotalVMs   int `json:"total_vms"`
	RunningVMs int `json:"running_vms"`
	StoppedVMs int `json:"stopped_vms"`

	CPUUsagePercent     float64 `json:"cpu_usage_percent"`
	MemoryUsagePercent  float64 `json:"memory_usage_percent"`
	StorageUsagePercent float64 `json:"storage_usage_percent"`

	Nodes []Node `json:"nodes"`
}
