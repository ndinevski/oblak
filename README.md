# Oblak - Private Cloud Platform

Oblak is a private cloud platform consisting of modular services for building self-hosted cloud infrastructure. Currently, it includes three core services: **Impuls** (FaaS service), **Spomen** (Object Storage service), and **Izvor** (VM service).

## Services

### 🚀 Impuls - Serverless Functions

A lightweight FaaS (Function as a Service) platform built on top of Firecracker microVMs, providing Lambda-like experience for running serverless functions.

**Features:**
- Function management (create, update, delete, list)
- HTTP invocation endpoints
- Fast cold starts with Firecracker microVMs
- Multi-language support: Node.js, Python, .NET
- Secure isolation per function

📖 [Full Documentation](impuls/README.md)

### 💾 Spomen - Object Storage

S3-compatible object storage service powered by MinIO, with a simplified REST API for bucket and object management.

**Features:**
- S3-compatible storage API
- Bucket management with access policies
- Object versioning support
- Web-based admin console (MinIO)

📖 [Full Documentation](spomen/README.md)

### 🖥️ Izvor - VM Provisioning

EC2-like VM provisioning and management service powered by Proxmox VE, enabling self-service virtual machine deployment in your private cloud.

**Features:**
- VM lifecycle management (create, start, stop, delete)
- Predefined VM sizes (nano, micro, small, medium, large)
- Template-based provisioning
- Cloud-init configuration support
- Snapshot management
- Cluster-aware node distribution

📖 [Full Documentation](izvor/README.md)

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Go 1.21+ (for local development)
- Linux with KVM support (for Impuls Firecracker mode)

---

## Docker Setup

### Spomen (Object Storage)

```bash
cd spomen

# Copy and configure environment
cp .env.example .env

# Start MinIO + Spomen API
docker compose up -d

# Check status
docker compose ps
```

**Services started:**
| Service | URL | Description |
|---------|-----|-------------|
| Spomen API | http://localhost:8081 | REST API for storage |
| Spomen Objet Storage | http://localhost:9000 | S3-compatible endpoint |
| MinIO Console | http://localhost:9001 | Web admin UI |

**Verify it's running:**
```bash
curl http://localhost:8081/health
```

### Impuls (Serverless Functions)

#### Development Mode (No Firecracker)

For local development without KVM/Firecracker:

```bash
cd impuls

# Start PostgreSQL + Impuls API (dev mode)
docker compose --profile dev up -d

# Check status
docker compose ps
```

#### Production Mode (With Firecracker)

Requires Linux with KVM support (`/dev/kvm` must exist):

```bash
cd impuls

# Start PostgreSQL + Impuls with Firecracker isolation
docker compose up -d

# Check status
docker compose ps
```

**Services started:**
| Service | URL | Description |
|---------|-----|-------------|
| Impuls API | http://localhost:8080 | Functions API |

**Verify it's running:**
```bash
curl http://localhost:8080/health
```

### Izvor (VM Provisioning)

Izvor requires a Proxmox VE cluster to provision VMs:

```bash
cd izvor

# Copy and configure environment
cp .env.example .env
# Edit .env with your Proxmox credentials

# Start Izvor API
docker compose up -d

# Check status
docker compose ps
```

**Services started:**
| Service | URL | Description |
|---------|-----|-------------|
| Izvor API | http://localhost:8082 | VM provisioning API |

**Verify it's running:**
```bash
curl http://localhost:8082/health
```

---

### Run All Tests

```bash
# Run the full test suite for all services
make test

# Or run tests for individual services
make test-impuls
make test-spomen
make test-izvor
```

## Project Structure

```
oblak/
├── impuls/                 # Serverless functions service
│   ├── cmd/                # Server entrypoint
│   ├── internal/           # Core implementation
│   │   ├── api/            # HTTP API handlers
│   │   ├── firecracker/    # VM management
│   │   ├── function/       # Function executors
│   │   ├── models/         # Data models
│   │   └── storage/        # Persistence layer
│   ├── runtimes/           # Language runtimes (Node.js, Python, .NET)
│   └── scripts/            # Utility scripts
│
├── spomen/                 # Object storage service
│   ├── cmd/                # Server entrypoint
│   ├── internal/           # Core implementation
│   │   ├── api/            # HTTP API handlers
│   │   ├── models/         # Data models
│   │   └── storage/        # MinIO client
│   └── scripts/            # Utility scripts
│
├── izvor/                  # VM provisioning service
│   ├── cmd/                # Server entrypoint
│   ├── internal/           # Core implementation
│   │   ├── api/            # HTTP API handlers
│   │   ├── models/         # Data models
│   │   └── proxmox/        # Proxmox VE client
│   └── scripts/            # Utility scripts
│
└── Makefile                # Root-level build/test commands
```

## Development

### Running Tests

```bash
# Run all tests with verbose output
make test

# Run tests with coverage
make test-coverage

# Run specific service tests
make test-impuls
make test-spomen
make test-izvor
```

### Building

```bash
# Build all services
make build

# Build specific service
make build-impuls
make build-spomen
make build-izvor
```

## Service Endpoints

| Service | Port | Description |
|---------|------|-------------|
| Impuls API | 8080 | Serverless functions API |
| Spomen API | 8081 | Object storage REST API |
| Izvor API | 8082 | VM provisioning API |
| MinIO S3 | 9000 | S3-compatible endpoint |
| MinIO Console | 9001 | Web admin interface |

## License

See individual service directories for license information.
