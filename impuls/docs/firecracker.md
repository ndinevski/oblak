# Firecracker Integration Guide

This document explains how Impuls uses Firecracker microVMs to execute serverless functions.

## Overview

Firecracker is a virtual machine monitor (VMM) that uses KVM to create and manage microVMs. Impuls uses Firecracker to provide:

- **Strong isolation**: Each function runs in its own VM
- **Fast cold starts**: VMs boot in <150ms
- **Security**: Hardware-level isolation between functions
- **Resource limits**: Memory and CPU limits enforced by the hypervisor

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

## Filesystem

### Base Rootfs

A minimal Linux filesystem containing:
- BusyBox or Alpine Linux base
- Node.js runtime
- Impuls runtime scripts

### Overlay (Copy-on-Write)

Each VM gets a copy of the base rootfs:
- Uses `cp --reflink=auto` for efficient COW copies
- Function code is injected into `/var/task`
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
