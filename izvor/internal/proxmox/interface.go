package proxmox

import (
	"context"

	"github.com/oblak/izvor/internal/models"
)

// ProxmoxClient defines the interface for Proxmox API operations
// This interface allows for mocking in tests
type ProxmoxClient interface {
	// Health and connectivity
	HealthCheck(ctx context.Context) error
	GetVersion(ctx context.Context) (string, error)

	// Node operations
	GetDefaultNode(ctx context.Context) (string, error)
	ListNodes(ctx context.Context) ([]models.Node, error)

	// VM operations
	ListVMs(ctx context.Context, node string) ([]models.VirtualMachine, error)
	GetVM(ctx context.Context, node, vmid string) (*models.VirtualMachine, error)
	CreateVM(ctx context.Context, req *models.CreateVMRequest) (*models.VirtualMachine, string, error)
	DeleteVM(ctx context.Context, node, vmid string) error

	// VM power operations
	StartVM(ctx context.Context, node, vmid string) (string, error)
	StopVM(ctx context.Context, node, vmid string, force bool) (string, error)
	RebootVM(ctx context.Context, node, vmid string) (string, error)
	ResetVM(ctx context.Context, node, vmid string) (string, error)
	SuspendVM(ctx context.Context, node, vmid string) (string, error)
	ResumeVM(ctx context.Context, node, vmid string) (string, error)

	// Snapshot operations
	ListSnapshots(ctx context.Context, node, vmid string) ([]models.Snapshot, error)
	CreateSnapshot(ctx context.Context, node, vmid string, req *models.CreateSnapshotRequest) (*models.Snapshot, error)
	DeleteSnapshot(ctx context.Context, node, vmid, name string) error
	RollbackSnapshot(ctx context.Context, node, vmid, name string) error

	// Template operations
	ListTemplates(ctx context.Context) ([]models.VMTemplate, error)

	// Storage operations
	ListStorages(ctx context.Context, node string) ([]models.Storage, error)

	// Network operations
	ListNetworks(ctx context.Context, node string) ([]models.Network, error)

	// Task operations
	GetTask(ctx context.Context, node, upid string) (*models.Task, error)

	// Console operations
	GetVNCConsole(ctx context.Context, node, vmid string) (*models.Console, error)
}

// Ensure Client implements ProxmoxClient interface
var _ ProxmoxClient = (*Client)(nil)
