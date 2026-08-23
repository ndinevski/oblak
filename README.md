# Oblak - Private Cloud Platform

Oblak is a private cloud platform consisting of modular services for building self-hosted cloud infrastructure. Currently, it includes seven core services: **Impuls** (FaaS service), **Spomen** (Object Storage service), **Izvor** (VM service), **Brod** (Container service), **Tefter** (Database service), **Vrata** (Gateway), and **Polaroid** (Photo & Video Management).

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

### 🚢 Brod - Containers

Self-hosted container platform providing an image registry and a container
runtime, in the shape of ECR and ECS. Backed by a stock Docker Distribution
registry and the host's container engine.

**Features:**
- Image repositories with tags, digests, sizes and platform detail
- Push and pull with the standard `docker` CLI
- Run containers from pushed images, with ports, env, volumes and resource limits
- Start, stop, restart, logs and live resource stats
- Only ever touches containers it created, never other workloads on the host

📖 [Full Documentation](brod/README.md)

### 🗄️ Tefter - Databases

Managed PostgreSQL and MySQL, in the shape of Amazon RDS. Each instance is a
database container Tefter provisions on demand and publishes on a host port for
ordinary clients.

**Features:**
- Provision PostgreSQL (16, 15, 14) or MySQL (8.4, 8.0) at predefined sizes
- Read replicas seeded from the primary and kept in sync, with live lag
- Promote a replica to a standalone primary
- On-demand logical backups that outlive their instance
- Restore over an instance, with an automatic safety backup taken first
- The instance password is generated and shown exactly once

📖 [Full Documentation](tefter/README.md)

### 🚪 Vrata - Gateway

Instrumented reverse proxy in front of the workloads Oblak runs, so every
request to a Brod container or an Izvor VM is traced and logged. Workloads run
the operator's own images and carry no telemetry of their own; routing their
traffic through Vrata makes it visible in the observability stack like any other
service.

**Features:**
- Route table mapping a name or hostname to a container or VM upstream
- Host-header routing (path preserved) and path-prefix routing (prefix stripped)
- A trace, an access-log line and RED metrics for every proxied request
- Trace context propagated downstream, so an instrumented workload joins the trace
- Requests to a stopped container or a down VM are recorded as 502s, not silence

📖 [Full Documentation](vrata/README.md)

### 📊 Observability - Platform Telemetry

CloudWatch-style observability across every Oblak service, built on
OpenTelemetry with ClickHouse as the unified store for logs, metrics and traces.

**Features:**
- Log explorer with search, field filtering and live tail
- Distributed tracing with span waterfalls and a service map
- Metric catalogue covering application, host and container metrics
- Audit trail correlated with the request traces that produced it
- Browser telemetry (RUM) linked end to end with backend traces
- Threshold alerting with webhook and email notifications
- Postgres internals for every Oblak database

📖 [Full Documentation](observability/README.md)

### 📸 Polaroid - Photo & Video Management

Self-hosted photo and video management service powered by Immich, providing Google Photos-like experience with AI-powered search, facial recognition, and mobile app uploads.

**Features:**
- Photo/video timeline with time buckets
- Album management (create, share, organize)
- People & facial recognition
- AI-powered smart search (CLIP)
- Map view with geotagged photos
- Shared links with password protection & expiry
- Mobile app upload support (via Immich app)
- Storage & API key management

📖 [Full Documentation](polaroid/README.md)

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Go 1.21+ (for local development)
- Node.js 20+ (for dashboard and Polaroid)
- Linux with KVM support (for Impuls Firecracker mode)

---

## Local Development Setup (Full Stack)

```bash
# 1. Start the Oblak development database
docker compose -f docker-compose.dev.yml up oblak-postgres-dev -d

# 2. Start the observability stack (ClickHouse + OpenTelemetry collector)
make up-observability

# 3. Start Brod (container service: API + image registry)
make up-brod

# 4. Start Tefter (database service API)
make up-tefter

# 5. Start Vrata (gateway: traces + logs for traffic to workloads)
make up-vrata

# 4. Start Polaroid/Immich containers (see polaroid/README.md for first-time setup)
make up-polaroid

# 5. Start the Strapi backend
cd backend-dashboard
npm install  # first time only
npm run develop
# Backend runs at http://localhost:1337

# 6. Start the frontend
cd frontend-dashboard
npm install  # first time only
npm run dev
# Frontend runs at http://localhost:5174
# (5173 is taken by Strapi's admin HMR server while `npm run develop` is up)
```

Login with demo@oblak.local / DemoPass123!.

> **First time?** Polaroid requires one-time admin setup (create admin user, generate API key). See [Polaroid README](polaroid/README.md) for detailed instructions.

### Stopping Services

```bash
make down-polaroid                    # Stop Immich stack
make down-brod                        # Stop Brod
make down-tefter                      # Stop Tefter
make down-vrata                       # Stop Vrata
make down-observability               # Stop ClickHouse + collector
docker compose -f docker-compose.dev.yml down  # Stop Oblak DB
# Ctrl+C in backend/frontend terminals
```

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

# Start PostgreSQL + Impuls API (dev mode).
# Name the services explicitly: the production `impuls` service has no profile,
# so a bare `--profile dev up` starts it too and both bind port 8080.
docker compose --profile dev up -d postgres impuls-dev

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

Izvor requires a reachable Proxmox VE cluster. Note that `proxmox.NewClient`
authenticates eagerly when `PROXMOX_PASSWORD` is set, so a placeholder password
with no reachable cluster makes the process exit at startup. Leave
`PROXMOX_PASSWORD` empty to let the API boot in a degraded state (`/health`
reports `unhealthy`) while you configure a real endpoint:

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

### Polaroid (Photo & Video Management)

Polaroid runs Immich with its own Postgres (pgvecto.rs), Redis, and ML service:

```bash
make up-polaroid
# Or: cd polaroid && docker compose up -d

# Verify
curl http://localhost:2283/api/server/ping
```

📖 [Full setup guide, mobile app config, and troubleshooting](polaroid/README.md)

---

### Run All Tests

```bash
# Run the full test suite for all services
make test

# Or run tests for individual services
make test-impuls
make test-spomen
make test-izvor
make test-brod
make test-tefter
make test-vrata
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
├── tefter/                 # Database service
├── vrata/                  # Gateway (data-plane observability)
├── brod/                   # Container service
│   ├── cmd/                # Server entrypoint
│   ├── internal/           # Core implementation
│   │   ├── api/            # HTTP API handlers
│   │   ├── engine/         # Docker engine and registry clients
│   │   ├── models/         # Data models
│   │   └── telemetry/      # OpenTelemetry wiring
│   └── docker-compose.yml  # Brod API + image registry
│
├── polaroid/               # Photo & video management service
│   ├── docker-compose.yml  # Immich stack (server, ML, Redis, Postgres)
│   ├── README.md           # Full setup & API documentation
│   └── .env.example        # Environment configuration
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
make test-brod
make test-tefter
make test-vrata
```

### Building

```bash
# Build all services
make build

# Build specific service
make build-impuls
make build-spomen
make build-izvor
make build-brod
```

## Service Endpoints

| Service | Port | Description |
|---------|------|-------------|
| Impuls API | 8080 | Serverless functions API |
| Spomen API | 8081 | Object storage REST API |
| Izvor API | 8082 | VM provisioning API |
| Brod API | 8083 | Container and image registry API |
| Brod Registry | 5000 | Docker image registry (push/pull target) |
| Polaroid (Immich) | 2283 | Photo & video management API |
| MinIO S3 | 9000 | S3-compatible endpoint |
| MinIO Console | 9001 | Web admin interface |
| OTLP gRPC | 4317 | Telemetry ingest (services) |
| OTLP HTTP | 4318 | Telemetry ingest (browser RUM) |
| ClickHouse HTTP | 8123 | Telemetry store query interface |
| ClickHouse native | 9010 | Remapped off 9000, which MinIO uses |
| Collector health | 13133 | OpenTelemetry collector health |

## License

See individual service directories for license information.
