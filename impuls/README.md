# Impuls - Serverless Functions with Firecracker

Impuls is a lightweight FaaS (Function as a Service) platform built on top of Firecracker microVMs. It provides a Lambda-like experience for running serverless functions in your private cloud.

## Features

- **Function Management**: Create, update, delete, and list functions
- **HTTP Invocation**: Execute functions via HTTP endpoints
- **Fast Cold Starts**: Leverages Firecracker's sub-second boot times
- **Multi-Language Support**: Node.js, Python, and C# (.NET) runtimes
- **Secure Isolation**: Each function runs in its own microVM
- **Flexible Storage**: File-based or PostgreSQL storage backends
- **Production Ready**: Database-backed persistence with multi-instance support

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Impuls API Server                       │
│                    (HTTP REST Interface)                     │
├─────────────────────────────────────────────────────────────┤
│                    Function Manager                          │
│         (Create, Update, Delete, List Functions)            │
├─────────────────────────────────────────────────────────────┤
│            Storage Layer (File or PostgreSQL)                │
│         (Function Metadata & Code Persistence)               │
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
- PostgreSQL 12+ (optional, for production deployments)

## Storage Backends

Impuls supports two storage backends:

### File Storage (Default)
- Simple setup, no external dependencies
- Good for development and single-instance deployments
- Functions stored as JSON files + code files

### PostgreSQL Storage (Recommended for Production)
- Production-ready with replication support
- Supports multiple server instances
- Better performance for concurrent operations
- See [docs/storage.md](docs/storage.md) for details

## Quick Start

### Option 1: Docker with PostgreSQL (Recommended for Production)

```bash
# Start PostgreSQL + Impuls with database storage
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f impuls
```

This will start:
- PostgreSQL database on port 5432
- Impuls server on port 8080 (connected to PostgreSQL)

### Option 2: Docker Development Mode (File Storage)

**Development Mode** (no Firecracker, uses local Node.js, file storage):

```bash
# Start with Docker Compose
docker compose --profile dev up -d impuls-dev

# Or use the helper script
./scripts/docker-dev.sh
```

### Option 3: Build from Source

```bash
# Install Firecracker (optional, for VM isolation)
sudo ./scripts/install-firecracker.sh
sudo ./scripts/setup-images.sh

# Build the server
make build

# Run with file storage (development)
make dev

# Run with PostgreSQL storage (production)
export DB_CONN="postgres://impuls:impuls123@localhost:5432/impuls?sslmode=disable"
./build/impuls-server --storage postgres --db-conn "$DB_CONN"
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

## Configuration

### Environment Variables

- `STORAGE_TYPE`: Storage backend (`file` or `postgres`, default: `file`)
- `DB_CONN`: PostgreSQL connection string (required for `postgres` storage)
- `DATA_DIR`: Directory for function data (default: `/var/lib/impuls`)
- `IMPULS_LOCAL_MODE`: Run without Firecracker (default: `false`)

### Command Line Flags

```bash
./impuls-server \
  --port 8080 \
  --storage postgres \
  --db-conn "postgres://user:pass@localhost:5432/impuls?sslmode=disable" \
  --data-dir /var/lib/impuls \
  --firecracker /usr/local/bin/firecracker \
  --kernel /var/lib/impuls/images/vmlinux \
  --rootfs /var/lib/impuls/images/rootfs.ext4
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
