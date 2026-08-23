package proxmox

import (
	"time"

	"github.com/oblak/izvor/internal/models"
)

// NewSimulator returns an in-memory ProxmoxClient that behaves like a real
// cluster for the whole VM lifecycle (create, power, snapshot, delete) without
// any Proxmox at all. It is the runtime sibling of NewMockClient: same engine,
// but seeded for real use rather than tests.
//
// It seeds the infrastructure a cluster would expose (nodes, templates,
// storages, networks) so listing and create-time validation work, but starts
// with no VMs, so the only VMs that appear are the ones a user creates. VM ids
// begin at 1000 to stay clear of any hand-added fixtures.
//
// State lives in memory: a restart forgets simulated VMs. The dashboard keeps
// its own record of every VM in its database, so the list survives a restart;
// only live power state and simulator-side details reset.
func NewSimulator() *MockClient {
	m := &MockClient{
		nodes:     make([]models.Node, 0),
		vms:       make(map[string]*models.VirtualMachine),
		snapshots: make(map[string][]models.Snapshot),
		templates: make([]models.VMTemplate, 0),
		storages:  make([]models.Storage, 0),
		networks:  make([]models.Network, 0),
		nextVMID:  1000,
	}

	now := time.Now()

	m.nodes = append(m.nodes, models.Node{
		Name:        "oblak-sim",
		Status:      "online",
		Cores:       32,
		Memory:      137438953472,  // 128GB
		MemoryUsed:  17179869184,   // 16GB
		DiskTotal:   2199023255552, // 2TB
		DiskUsed:    274877906944,  // 256GB
		CPUUsage:    8.0,
		MemoryUsage: 12.5,
		Uptime:      604800, // 7 days
	})

	// Templates mirror the OS choices the dashboard offers.
	m.templates = append(m.templates,
		models.VMTemplate{ID: "9000", Name: "ubuntu-22.04", Description: "Ubuntu 22.04 LTS cloud image", OSType: models.OSTypeLinux, Node: "oblak-sim", DiskSize: 10, CreatedAt: now.Add(-30 * 24 * time.Hour)},
		models.VMTemplate{ID: "9001", Name: "debian-12", Description: "Debian 12 cloud image", OSType: models.OSTypeLinux, Node: "oblak-sim", DiskSize: 8, CreatedAt: now.Add(-30 * 24 * time.Hour)},
		models.VMTemplate{ID: "9002", Name: "rocky-9", Description: "Rocky Linux 9 cloud image", OSType: models.OSTypeLinux, Node: "oblak-sim", DiskSize: 10, CreatedAt: now.Add(-30 * 24 * time.Hour)},
	)

	m.storages = append(m.storages, models.Storage{
		Name: "local-lvm", Type: "lvmthin", Node: "oblak-sim",
		Total: 2199023255552, Used: 274877906944, Available: 1924145441792,
		UsagePercent: 12.5, Content: []string{"images", "rootdir"}, Shared: false, Enabled: true,
	})

	m.networks = append(m.networks, models.Network{
		Name: "vmbr0", Type: "bridge", Node: "oblak-sim",
		Address: "10.10.0.1", Netmask: "255.255.255.0", Gateway: "10.10.0.1",
		BridgePorts: "eth0", Active: true,
	})

	return m
}
