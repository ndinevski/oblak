# Izvor - VM Provisioning Service

Izvor is the VM provisioning and management component of the private cloud, powered by [Proxmox VE](https://www.proxmox.com/). It provides an EC2-like experience for creating and managing virtual machines.

## Features

- **VM Lifecycle Management**: Create, start, stop, reboot, delete VMs
- **Template Support**: Create VMs from templates or ISO images
- **Cloud-Init Integration**: Automated VM configuration with cloud-init
- **Snapshot Management**: Create, list, rollback, and delete snapshots
- **Console Access**: VNC console access to VMs
- **Predefined Sizes**: EC2-like instance sizes (micro, small, medium, large, etc.)
- **Cluster Support**: Works with Proxmox clusters and standalone nodes
- **Resource Monitoring**: CPU, memory, disk, and network usage stats

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Izvor API Server                        │
│                    (HTTP REST Interface)                     │
├─────────────────────────────────────────────────────────────┤
│                     Proxmox Client                           │
│              (API communication with PVE)                    │
├─────────────────────────────────────────────────────────────┤
│                    Proxmox VE Cluster                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Node 1  │  │ Node 2  │  │ Node 3  │  │ Node N  │        │
│  │   VMs   │  │   VMs   │  │   VMs   │  │   VMs   │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Proxmox VE 7.0+ (8.x recommended)
- Docker (recommended) or Go 1.21+
- Network access to Proxmox API (port 8006)

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your Proxmox credentials

# Start the service
docker compose up -d

# Check status
curl http://localhost:8082/health
```

### Option 2: Build from Source

```bash
# Build the server
make build

# Run with environment variables
export PROXMOX_URL=https://proxmox.local:8006
export PROXMOX_USER=root@pam
export PROXMOX_PASSWORD=your-password

make dev
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `IZVOR_PORT` | API server port | `8082` |
| `PROXMOX_URL` | Proxmox API URL | (required) |
| `PROXMOX_USER` | Proxmox username | `root@pam` |
| `PROXMOX_PASSWORD` | Proxmox password | |
| `PROXMOX_TOKEN_ID` | API token ID (alternative) | |
| `PROXMOX_TOKEN_SECRET` | API token secret | |
| `PROXMOX_NODE` | Default node name | (auto-discover) |
| `PROXMOX_INSECURE` | Skip TLS verification | `false` |

### API Token Authentication (Recommended)

For production, use API tokens instead of passwords:

1. In Proxmox, go to **Datacenter > Permissions > API Tokens**
2. Create a new token for your user
3. Set `PROXMOX_TOKEN_ID` and `PROXMOX_TOKEN_SECRET`

## API Reference

### Health Check

```bash
curl http://localhost:8082/health
```

---

### Virtual Machines

#### List VMs

```bash
# List all VMs
curl http://localhost:8082/api/v1/vms

# List VMs on a specific node
curl "http://localhost:8082/api/v1/vms?node=pve"
```

#### Create VM

```bash
# Create from template with predefined size
curl -X POST http://localhost:8082/api/v1/vms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-server",
    "template": "ubuntu-22.04",
    "size": "medium",
    "cloud_init": {
      "user": "admin",
      "ssh_keys": ["ssh-rsa AAAA..."],
      "ip_config": "ip=dhcp"
    },
    "start_on_create": true
  }'

# Create with custom resources
curl -X POST http://localhost:8082/api/v1/vms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "custom-server",
    "template": "debian-12",
    "cores": 4,
    "memory": 8192,
    "disk_size": 100,
    "tags": ["production", "web"]
  }'
```

#### Get VM Details

```bash
curl http://localhost:8082/api/v1/vms/100
```

#### Delete VM

```bash
curl -X DELETE http://localhost:8082/api/v1/vms/100
```

#### VM Actions

```bash
# Start VM
curl -X POST http://localhost:8082/api/v1/vms/100/actions \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'

# Stop VM (graceful shutdown)
curl -X POST http://localhost:8082/api/v1/vms/100/actions \
  -H "Content-Type: application/json" \
  -d '{"action": "shutdown"}'

# Force stop VM
curl -X POST http://localhost:8082/api/v1/vms/100/actions \
  -H "Content-Type: application/json" \
  -d '{"action": "stop", "force": true}'

# Reboot VM
curl -X POST http://localhost:8082/api/v1/vms/100/actions \
  -H "Content-Type: application/json" \
  -d '{"action": "reboot"}'

# Create snapshot
curl -X POST http://localhost:8082/api/v1/vms/100/actions \
  -H "Content-Type: application/json" \
  -d '{"action": "snapshot", "snapshot_name": "before-update"}'

# Clone VM
curl -X POST http://localhost:8082/api/v1/vms/100/actions \
  -H "Content-Type: application/json" \
  -d '{"action": "clone", "clone_name": "my-server-clone"}'
```

#### Get Console Access

```bash
curl http://localhost:8082/api/v1/vms/100/console
```

---

### Instance Sizes

```bash
curl http://localhost:8082/api/v1/vms/sizes
```

Available sizes:

| Size | vCPUs | Memory | Disk |
|------|-------|--------|------|
| micro | 1 | 512MB | 10GB |
| small | 1 | 1GB | 20GB |
| medium | 2 | 2GB | 40GB |
| large | 4 | 4GB | 80GB |
| xlarge | 8 | 8GB | 160GB |
| xxlarge | 16 | 16GB | 320GB |

---

### Snapshots

#### List Snapshots

```bash
curl http://localhost:8082/api/v1/vms/100/snapshots
```

#### Create Snapshot

```bash
curl -X POST http://localhost:8082/api/v1/vms/100/snapshots \
  -H "Content-Type: application/json" \
  -d '{
    "name": "before-upgrade",
    "description": "Snapshot before system upgrade",
    "include_ram": true
  }'
```

#### Rollback to Snapshot

```bash
curl -X POST http://localhost:8082/api/v1/vms/100/snapshots/before-upgrade/rollback
```

#### Delete Snapshot

```bash
curl -X DELETE http://localhost:8082/api/v1/vms/100/snapshots/before-upgrade
```

---

### Templates

```bash
curl http://localhost:8082/api/v1/templates
```

---

### Nodes

#### List Nodes

```bash
curl http://localhost:8082/api/v1/nodes
```

#### Get Node Details

```bash
curl http://localhost:8082/api/v1/nodes/pve
```

#### List Node Storage

```bash
curl http://localhost:8082/api/v1/nodes/pve/storage
```

#### List Node Networks

```bash
curl http://localhost:8082/api/v1/nodes/pve/networks
```

---

### Cluster

#### Get Cluster Status

```bash
curl http://localhost:8082/api/v1/cluster/status
```

#### Get Cluster Resources

```bash
curl http://localhost:8082/api/v1/cluster/resources
```

---

### Storage

```bash
curl http://localhost:8082/api/v1/storage
```

---

### Tasks

```bash
# Check task status
curl "http://localhost:8082/api/v1/tasks/UPID:pve:...?node=pve"
```

## Preparing VM Templates

For the best experience, prepare cloud-init enabled templates in Proxmox:

### Ubuntu/Debian Template

```bash
# Download cloud image
wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img

# Create VM
qm create 9000 --name ubuntu-22.04 --memory 2048 --cores 2 --net0 virtio,bridge=vmbr0

# Import disk
qm importdisk 9000 jammy-server-cloudimg-amd64.img local-lvm

# Attach disk
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0

# Add cloud-init drive
qm set 9000 --ide2 local-lvm:cloudinit

# Set boot order
qm set 9000 --boot order=scsi0

# Convert to template
qm template 9000
```

### CentOS/Rocky Template

```bash
# Download cloud image
wget https://download.rockylinux.org/pub/rocky/9/images/x86_64/Rocky-9-GenericCloud.latest.x86_64.qcow2

# Create and configure VM (similar to above)
qm create 9001 --name rocky-9 --memory 2048 --cores 2 --net0 virtio,bridge=vmbr0
qm importdisk 9001 Rocky-9-GenericCloud.latest.x86_64.qcow2 local-lvm
qm set 9001 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9001-disk-0
qm set 9001 --ide2 local-lvm:cloudinit
qm set 9001 --boot order=scsi0
qm template 9001
```

## Integration with Other Services

Izvor works well with other oblak services:

- **Impuls**: Run serverless functions that manage VMs
- **Spomen**: Store VM disk images and backups

## Development

```bash
# Run tests
make test

# Run tests with verbose output
go test -v ./...

# Format code
make fmt

# Build for current platform
make build

# Build for Linux
make build-linux
```

### Testing Without Proxmox

Izvor includes a mock Proxmox client that allows testing all functionality without a real Proxmox server or KVM support:

```bash
# Run all tests (uses mock client)
go test -v ./...

# Run API tests only
go test -v ./internal/api/...

# Run model tests only
go test -v ./internal/models/...
```

The mock client (`internal/proxmox/mock_client.go`) provides:
- Simulated nodes, VMs, templates, and storage
- All CRUD operations
- VM power operations (start, stop, reboot, etc.)
- Snapshot management
- Error injection for testing failure scenarios

## Troubleshooting

### Connection refused

Ensure Proxmox API is accessible and firewall allows port 8006.

### Authentication failed

- Check username format (e.g., `root@pam`, `user@pve`)
- Verify password or API token
- Ensure user has appropriate permissions

### TLS certificate errors

For self-signed certificates, set `PROXMOX_INSECURE=true` or add the CA to the container.

## License

MIT License
