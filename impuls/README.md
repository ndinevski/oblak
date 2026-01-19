# Impuls - Serverless Functions with Firecracker

Impuls is a lightweight FaaS (Function as a Service) platform built on top of Firecracker microVMs. It provides a Lambda-like experience for running serverless functions in your private cloud.

## Features

- **Function Management**: Create, update, delete, and list functions
- **HTTP Invocation**: Execute functions via HTTP endpoints
- **Fast Cold Starts**: Leverages Firecracker's sub-second boot times
- **Multi-Language Support**: Node.js, Python, and C# (.NET) runtimes
- **Secure Isolation**: Each function runs in its own microVM

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Impuls API Server                       │
│                    (HTTP REST Interface)                     │
├─────────────────────────────────────────────────────────────┤
│                    Function Manager                          │
│         (Create, Update, Delete, List Functions)            │
├─────────────────────────────────────────────────────────────┤
│                   Firecracker Manager                        │
│            (VM Lifecycle, Network, Storage)                  │
├─────────────────────────────────────────────────────────────┤
│                    Firecracker VMs                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │  VM 1   │  │  VM 2   │  │  VM 3   │  │  VM N   │        │
│  │ Node.js │  │ Python  │  │  .NET   │  │   ...   │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Linux with KVM support (`/dev/kvm` must exist) - for Firecracker mode
- Docker (recommended) or Go 1.21+
- Root/sudo access for VM management (Firecracker mode only)

## Quick Start

### Option 1: Docker (Recommended)

**Development Mode** (no Firecracker, uses local Node.js):

```bash
# Start with Docker Compose
docker compose --profile dev up -d impuls-dev

# Or use the helper script
./scripts/docker-dev.sh
```

**Production Mode** (with Firecracker isolation - requires KVM):

```bash
# Start with full Firecracker support
docker compose up -d impuls

# Or use the helper script
./scripts/docker-start.sh
```

### Option 2: Build from Source

```bash
# Install Firecracker (optional, for VM isolation)
sudo ./scripts/install-firecracker.sh
sudo ./scripts/setup-images.sh

# Build the server
make build

# Run in development mode (no Firecracker)
make dev

# Run with Firecracker (requires root)
sudo ./build/impuls-server --port 8080
```

### Create Your First Function

```bash
# Create a function
curl -X POST http://localhost:8080/api/v1/functions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "hello-world",
    "runtime": "nodejs20",
    "handler": "index.handler",
    "code": "exports.handler = async (event) => { return { statusCode: 200, body: \"Hello from Impuls!\" }; }"
  }'

# Invoke the function (use ?local=true for dev mode)
curl -X POST http://localhost:8080/api/v1/functions/hello-world/invoke?local=true \
  -H "Content-Type: application/json" \
  -d '{"name": "World"}'
```

## Docker Commands

```bash
# Start in development mode
docker compose --profile dev up -d impuls-dev

# Start in production mode (with Firecracker)
docker compose up -d impuls

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after changes
docker compose build
```

## API Reference

### Functions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/functions` | Create a function |
| GET | `/api/v1/functions` | List all functions |
| GET | `/api/v1/functions/{name}` | Get function details |
| PUT | `/api/v1/functions/{name}` | Update a function |
| DELETE | `/api/v1/functions/{name}` | Delete a function |
| POST | `/api/v1/functions/{name}/invoke` | Invoke a function |

### Request/Response Examples

See [docs/api.md](docs/api.md) for detailed API documentation.

## Project Structure

```
impuls/
├── cmd/
│   └── impuls-server/      # Main server binary
├── internal/
│   ├── api/                # HTTP API handlers
│   ├── function/           # Function management
│   ├── firecracker/        # Firecracker VM management
│   ├── models/             # Data models
│   └── storage/            # Function code storage
├── runtimes/
│   ├── nodejs/             # Node.js runtime files
│   ├── python/             # Python runtime files
│   └── dotnet/             # .NET (C#) runtime files
├── scripts/                # Setup and utility scripts
├── images/                 # Kernel and rootfs images
└── docs/                   # Documentation
```

## License

MIT License - See LICENSE file for details.
