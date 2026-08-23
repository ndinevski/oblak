# Firecracker Integration Guide

This document explains how Impuls uses Firecracker microVMs to execute serverless functions.

## Overview

Firecracker is a virtual machine monitor (VMM) that uses KVM to create and manage microVMs. Impuls uses Firecracker to provide:

- **Strong isolation**: Each function runs in its own VM
- **Fast cold starts**: VMs boot in <150ms
- **Security**: Hardware-level isolation between functions
- **Resource limits**: Memory and CPU limits enforced by the hypervisor

## Quick start (validated)

Real Firecracker needs a Linux host with KVM (bare metal or a nested-virt VM),
run as root. It cannot run inside an unprivileged container.

```bash
# 1. Confirm KVM is available
ls -l /dev/kvm                       # must exist
grep -oE 'vmx|svm' /proc/cpuinfo | head -1   # CPU virtualization

# 2. Install the firecracker binary
sudo ./scripts/install-firecracker.sh

# 3. Fetch the kernel and build the Node.js rootfs (needs docker + root)
sudo ./scripts/setup-images.sh

# 4. Run the server as root (Firecracker, TAP networking, KVM all need it)
sudo impuls-server --storage postgres --db-conn "postgres://impuls:impuls123@127.0.0.1:5432/impuls?sslmode=disable"

# 5. Invoke through a microVM (omit ?local=true)
curl -X POST http://localhost:8080/api/v1/functions/<name>/invoke -d '{...}'
```

A cold invoke boots a fresh microVM, runs the function as PID 1, returns the
result, and tears the VM down (~1-1.5s end to end). Add `?local=true` to run in
a host process instead, for development on machines without KVM.

## Local mode vs Firecracker

Impuls supports two execution paths, chosen per invocation:

- **Firecracker** (default): each invocation runs in its own microVM. Strong
  isolation, needs KVM and root.
- **Local** (`?local=true`, or `IMPULS_LOCAL_INVOKE_DEFAULT=true` on the
  dashboard): the function runs in a host child process. No isolation, no KVM
  required - meant for development (this is what a Windows/WSL box without
  Firecracker uses).

The dashboard picks the default from `IMPULS_LOCAL_INVOKE_DEFAULT`. To make the
dashboard use real Firecracker, point `IMPULS_URL` at an Impuls server running
on a KVM host and set `IMPULS_LOCAL_INVOKE_DEFAULT=false`.

## Deployment note: run on the host

The stock `docker-compose.yml` runs Impuls in a container in **local mode** -
convenient, but a container cannot provision microVMs (no `/dev/kvm`, no TAP,
not privileged). For Firecracker, run `impuls-server` natively on the KVM host
(as root, e.g. via the provided systemd unit `deploy/impuls.service`), keep the
`impuls-postgres` container for storage, and point the dashboard's `IMPULS_URL`
at the host server.

Two host-mode specifics, both handled by `deploy/impuls.service`:

- **Storage:** the `impuls-postgres` container publishes `5433:5432`
  (`IMPULS_DB_HOST_PORT`), so the host server connects at
  `127.0.0.1:5433`. (5432 is the dashboard's own Postgres.)
- **Telemetry:** the host's `docker-proxy` mishandles gRPC (HTTP/2), so a
  host process cannot export to `localhost:4317`. `impuls-resolve-otel.sh`
  (an `ExecStartPre`) resolves the collector's container IP and points the
  exporter straight at it, bypassing the proxy. It re-runs on every restart, so
  restart Impuls if the collector's IP changes.

To switch the live deployment to Firecracker:

```bash
sudo ./scripts/install-firecracker.sh && sudo ./scripts/setup-images.sh
sudo cp deploy/impuls-resolve-otel.sh /usr/local/bin/
sudo cp deploy/impuls.service /etc/systemd/system/
go build -o /usr/local/bin/impuls-server ./cmd/impuls-server
docker compose up -d postgres            # publishes 5433 for the host
docker compose stop impuls               # free :8080 for the host server
sudo systemctl enable --now impuls
# dashboard: set IMPULS_LOCAL_INVOKE_DEFAULT=false, restart it
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Impuls Server                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  Firecracker Manager                       │  │
│  │  - Creates/destroys VMs                                    │  │
│  │  - Manages networking                                      │  │
│  │  - Handles function code injection                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    VM Pool (Optional)                      │  │
│  │  - Pre-warmed VMs for faster cold starts                   │  │
│  │  - Runtime-specific pools (nodejs20, etc.)                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────┬───────────────────┬──────────────┐
    │              │                   │              │
    ▼              ▼                   ▼              ▼
┌────────┐   ┌────────┐          ┌────────┐    ┌────────┐
│  VM 1  │   │  VM 2  │   ...    │  VM N  │    │ Warm   │
│        │   │        │          │        │    │ Pool   │
│ Node.js│   │ Node.js│          │ Node.js│    │        │
│ Runtime│   │ Runtime│          │ Runtime│    │        │
└────────┘   └────────┘          └────────┘    └────────┘
```

## VM Lifecycle

### 1. VM Creation

When a function is invoked:

1. Firecracker process is started with a Unix socket for API communication
2. VM is configured via the Firecracker API:
   - Boot source (kernel image)
   - Root filesystem (copy-on-write overlay)
   - Machine config (vCPUs, memory)
   - Network interface (TAP device)
3. VM is started

### 2. Function Execution

1. The VM boots and starts the runtime (Node.js)
2. The runtime listens on port 8080 inside the VM
3. Impuls sends the function code and payload to the runtime
4. The runtime executes the handler and returns the result

### 3. VM Cleanup

After execution (or timeout):

1. The Firecracker process is terminated
2. TAP network device is removed
3. Overlay filesystem is deleted
4. Resources are freed

## Network Configuration

Each VM gets its own network namespace:

```
Host Side:                    Guest Side:
┌──────────────┐             ┌──────────────┐
│   tap-xxxx   │◄───────────►│     eth0     │
│ 172.16.X.1   │             │ 172.16.X.2   │
└──────────────┘             └──────────────┘
```

- Host TAP device: `tap-{vm-id-prefix}`
- Host IP: `172.16.X.1/30`
- Guest IP: `172.16.X.2/30`
- Port 8080 is used for runtime communication

The guest gets its address from the kernel, not from anything running inside the
VM: the manager passes `ip=<guest>::<host>:<netmask>::eth0:off` in the kernel
boot args, and the kernel (built with `CONFIG_IP_PNP`) configures `eth0` before
init runs. The guest agent then binds `0.0.0.0:8080` immediately. After boot the
manager polls `http://<guest>:8080/health` until the agent answers, so the first
invoke never races the boot. On teardown the TAP device and the per-VM overlay
are removed.

## Runtimes

All three runtimes run under Firecracker, each with its own rootfs built by
`scripts/build-rootfs.sh` (which `setup-images.sh` builds by default):

| Runtime | Base image | Rootfs | Agent |
|---|---|---|---|
| `nodejs20` | `node:20-slim` | `nodejs20-rootfs.ext4` | `runtimes/nodejs/runtime.js` |
| `python312` | `python:3.12-slim` | `python312-rootfs.ext4` | `runtimes/python/runtime.py` |
| `dotnet8` | `dotnet/aspnet:8.0` | `dotnet8-rootfs.ext4` | `runtimes/dotnet` (ASP.NET + Roslyn) |

The manager picks the rootfs by runtime (`<runtime>-rootfs.ext4`, with a family
fallback), so a `nodejs20` function boots the Node image, a `dotnet8` function
the .NET image, and so on.

**.NET needs more resources.** ASP.NET + in-VM Roslyn compilation is heavy:
give `dotnet8` functions at least **512 MB** of memory and a timeout of **60s+**
(128 MB / 30 s is enough for Node and Python but will thrash and time out for
.NET). At 512 MB a .NET cold invoke is ~2-3s; Node and Python are ~1s.

### Base Rootfs

Each rootfs contains the language runtime, the Impuls guest agent under
`/var/runtime`, and `/sbin/impuls-init` (PID 1) which mounts the pseudo
filesystems and starts the agent. The kernel configures `eth0` from the `ip=`
boot arg before init runs.

### Overlay (Copy-on-Write)

Each VM gets a copy of the base rootfs:
- Uses `cp --reflink=auto` for efficient COW copies
- Function code is delivered to the agent in the invocation payload
- Changes don't affect the base image

## Security Considerations

### Isolation

- Each function runs in a separate VM
- Hardware-level isolation via KVM
- Separate network namespace per VM

### Seccomp Filters

Firecracker uses seccomp filters to restrict syscalls:
- Only necessary syscalls are allowed
- Additional protection against container escapes

### Resource Limits

- Memory is limited by VM configuration
- CPU is limited by vCPU count
- Execution time is limited by timeout

## Performance Optimization

### VM Pool (Optional)

Pre-warm VMs to reduce cold start time:
- Keep a pool of ready-to-use VMs per runtime
- VMs are initialized with the runtime running
- Function code is injected on demand

### Snapshot/Restore (Future)

Use Firecracker's snapshot feature:
- Take snapshot of initialized VM
- Restore from snapshot instead of booting
- Sub-5ms restore times possible

## Troubleshooting

### VM Fails to Start

1. Check KVM is available: `ls -la /dev/kvm`
2. Verify firecracker binary: `firecracker --version`
3. Check kernel image exists and is valid
4. Check rootfs image exists and is mountable

### Network Issues

1. Check TAP device exists: `ip link show tap-*`
2. Verify IP assignment: `ip addr show`
3. Check iptables rules allow traffic
4. Test connectivity from host to guest IP

### Function Execution Fails

1. Check VM logs in `/var/lib/impuls/logs/{vm-id}.log`
2. Verify runtime is running inside VM
3. Check function code for syntax errors
4. Test with `?local=true` to run without Firecracker

## Configuration

### Firecracker Manager Config

```go
type Config struct {
    FirecrackerBin string  // Path to firecracker binary
    KernelPath     string  // Path to vmlinux kernel
    RootFSPath     string  // Path to rootfs.ext4
    DataDir        string  // Directory for VM data
}
```

### VM Config

```go
type VMConfig struct {
    ID           string            // Unique VM ID
    FunctionName string            // Function being executed
    MemoryMB     int               // Memory limit (default: 128)
    VCPUs        int               // vCPU count (default: 1)
    CodePath     string            // Path to function code
    Handler      string            // Handler function name
    Runtime      string            // Runtime identifier
    Environment  map[string]string // Environment variables
}
```

## Future Improvements

1. **Snapshot/Restore**: Use Firecracker snapshots for faster cold starts
2. **VM Reuse**: Reuse VMs for multiple invocations of the same function
3. **GPU Support**: Explore GPU passthrough for ML workloads
4. **Multi-runtime**: Add Python, Go, Rust runtimes
5. **Metrics**: Add detailed VM metrics and monitoring
