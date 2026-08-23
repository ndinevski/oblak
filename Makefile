.PHONY: all test test-impuls test-spomen test-izvor test-pristaniste test-tefter test-vrata test-indeks test-red test-dashboard test-coverage build build-impuls build-spomen build-izvor build-pristaniste build-tefter build-vrata build-indeks build-red build-dashboard clean help
.PHONY: dev dev-dashboard up down logs ps
.PHONY: up-polaroid down-polaroid logs-polaroid
.PHONY: up-observability down-observability logs-observability observability-net
.PHONY: up-pristaniste down-pristaniste logs-pristaniste
.PHONY: up-tefter down-tefter logs-tefter
.PHONY: up-vrata down-vrata logs-vrata
.PHONY: up-indeks down-indeks logs-indeks
.PHONY: up-red down-red logs-red

# Default target
help:
	@echo "Oblak - Private Cloud Platform"
	@echo ""
	@echo "Usage:"
	@echo "  make test              - Run all tests"
	@echo "  make test-impuls       - Run Impuls tests only"
	@echo "  make test-spomen       - Run Spomen tests only"
	@echo "  make test-izvor        - Run Izvor tests only"
	@echo "  make test-pristaniste         - Run Pristaniste tests only"
	@echo "  make test-tefter       - Run Tefter tests only"
	@echo "  make test-vrata        - Run Vrata tests only"
	@echo "  make test-indeks       - Run Indeks tests only"
	@echo "  make test-red          - Run Red tests only"
	@echo "  make test-dashboard    - Run Dashboard tests (frontend + backend)"
	@echo "  make test-coverage     - Run all tests with coverage"
	@echo "  make build             - Build all services"
	@echo "  make build-impuls      - Build Impuls server"
	@echo "  make build-spomen      - Build Spomen server"
	@echo "  make build-izvor       - Build Izvor server"
	@echo "  make build-pristaniste        - Build Pristaniste server"
	@echo "  make build-tefter      - Build Tefter server"
	@echo "  make build-vrata       - Build Vrata gateway"
	@echo "  make build-indeks      - Build Indeks store"
	@echo "  make build-red         - Build Red queue"
	@echo "  make build-dashboard   - Build Dashboard (frontend + backend)"
	@echo "  make clean             - Clean build artifacts"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make dev               - Start development environment"
	@echo "  make up                - Start production environment"
	@echo "  make down              - Stop all containers"
	@echo "  make logs              - View container logs"
	@echo "  make ps                - List running containers"
	@echo ""
	@echo "Polaroid (Photo Management):"
	@echo "  make up-polaroid       - Start Polaroid (Immich) containers"
	@echo "  make down-polaroid     - Stop Polaroid containers"
	@echo "  make logs-polaroid     - View Polaroid container logs"
	@echo ""
	@echo "Pristaniste (Containers):"
	@echo "  make up-pristaniste           - Start Pristaniste API and image registry"
	@echo "  make down-pristaniste         - Stop Pristaniste"
	@echo "  make logs-pristaniste         - View Pristaniste logs"
	@echo "  make up-tefter         - Start the Tefter database API"
	@echo "  make down-tefter       - Stop Tefter"
	@echo "  make logs-tefter       - View Tefter logs"
	@echo "  make up-vrata          - Start the Vrata gateway"
	@echo "  make down-vrata        - Stop Vrata"
	@echo "  make logs-vrata        - View Vrata logs"
	@echo "  make up-indeks         - Start the Indeks key/value store"
	@echo "  make down-indeks       - Stop Indeks"
	@echo "  make logs-indeks       - View Indeks logs"
	@echo "  make up-red            - Start the Red message queue"
	@echo "  make down-red          - Stop Red"
	@echo "  make logs-red          - View Red logs"
	@echo ""
	@echo "Observability (OpenTelemetry + ClickHouse):"
	@echo "  make up-observability   - Start ClickHouse and the OTel collector"
	@echo "  make down-observability - Stop the observability stack"
	@echo "  make logs-observability - View collector and ClickHouse logs"
	@echo ""

# Run all tests
test: test-impuls test-spomen test-izvor test-pristaniste test-tefter test-vrata test-indeks test-red test-dashboard
	@echo ""
	@echo "✓ All tests completed"

# Run Impuls tests
test-impuls:
	@echo "Running Impuls tests..."
	@cd impuls && go test -v ./...

# Run Spomen tests
test-spomen:
	@echo "Running Spomen tests..."
	@cd spomen && go test -v ./...

# Run Izvor tests
test-izvor:
	@echo "Running Izvor tests..."
	@cd izvor && go test -v ./...

# Run Pristaniste tests
test-pristaniste:
	@echo "Running Pristaniste tests..."
	@cd pristaniste && go test -v ./...

# Run Tefter tests
test-tefter:
	@echo "Running Tefter tests..."
	@cd tefter && go test -v ./...

# Run Vrata tests
test-vrata:
	@echo "Running Vrata tests..."
	@cd vrata && go test -v ./...

# Run Indeks tests
test-indeks:
	@echo "Running Indeks tests..."
	@cd indeks && go test -v ./...

# Run Red tests
test-red:
	@echo "Running Red tests..."
	@cd red && go test -v ./...

# Run Dashboard tests
test-dashboard:
	@echo "Running Dashboard tests..."
	@echo ""
	@echo "=== Backend Tests ==="
	@cd backend-dashboard && npm test
	@echo ""
	@echo "=== Frontend Tests ==="
	@cd frontend-dashboard && npm test

# Run all tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	@echo ""
	@echo "=== Impuls Coverage ==="
	@cd impuls && go test -cover ./...
	@echo ""
	@echo "=== Spomen Coverage ==="
	@cd spomen && go test -cover ./...
	@echo ""
	@echo "=== Izvor Coverage ==="
	@cd izvor && go test -cover ./...
	@echo ""
	@echo "=== Pristaniste Coverage ==="
	@cd pristaniste && go test -cover ./...
	@cd tefter && go test -cover ./...
	@cd vrata && go test -cover ./...
	@cd indeks && go test -cover ./...
	@cd red && go test -cover ./...

# Build all services
build: build-impuls build-spomen build-izvor build-pristaniste build-tefter build-vrata build-indeks build-red build-dashboard
	@echo ""
	@echo "✓ All services built"

# Build Impuls
build-impuls:
	@echo "Building Impuls..."
	@cd impuls && make build

# Build Spomen
build-spomen:
	@echo "Building Spomen..."
	@cd spomen && make build

# Build Izvor
build-izvor:
	@echo "Building Izvor..."
	@cd izvor && make build

# Build Pristaniste
build-pristaniste:
	@echo "Building Pristaniste..."
	@cd pristaniste && make build

# Build Tefter
build-tefter:
	@echo "Building Tefter..."
	@cd tefter && make build

# Build Vrata
build-vrata:
	@echo "Building Vrata..."
	@cd vrata && make build

# Build Indeks
build-indeks:
	@echo "Building Indeks..."
	@cd indeks && make build

# Build Red
build-red:
	@echo "Building Red..."
	@cd red && make build

# Build Dashboard
build-dashboard:
	@echo "Building Dashboard..."
	@echo ""
	@echo "=== Building Backend ==="
	@cd backend-dashboard && npm run build
	@echo ""
	@echo "=== Building Frontend ==="
	@cd frontend-dashboard && npm run build

# Clean all build artifacts
clean:
	@echo "Cleaning all build artifacts..."
	@cd impuls && make clean
	@cd spomen && rm -f spomen-server
	@cd izvor && rm -f izvor-server
	@cd pristaniste && rm -f pristaniste-server
	@cd tefter && rm -f tefter-server
	@cd vrata && rm -f vrata-server
	@cd indeks && rm -f indeks-server
	@cd red && rm -f red-server
	@cd backend-dashboard && rm -rf dist .cache
	@cd frontend-dashboard && rm -rf dist
	@echo "✓ Clean complete"

# ============================================
# Docker Commands
# ============================================

# Start development environment
dev:
	docker compose -f docker-compose.dev.yml up --build

# Start development in background
dev-dashboard:
	docker compose -f docker-compose.dev.yml up --build -d

# Start production environment
up:
	docker compose up --build -d

# Stop all containers
down:
	docker compose down
	docker compose -f docker-compose.dev.yml down

# View logs
logs:
	docker compose logs -f

# List running containers
ps:
	docker compose ps
	docker compose -f docker-compose.dev.yml ps

# ============================================
# Polaroid (Photo Management) Commands
# ============================================

# Start Polaroid (Immich) containers
up-polaroid:
	docker compose -f polaroid/docker-compose.yml up -d

# Stop Polaroid containers
down-polaroid:
	docker compose -f polaroid/docker-compose.yml down

# View Polaroid logs
logs-polaroid:
	docker compose -f polaroid/docker-compose.yml logs -f

# ============================================
# Observability (OpenTelemetry + ClickHouse)
# ============================================

# The collector lives on a shared external network so each service's own
# compose project can reach it by name. Creating it is idempotent.
observability-net:
	@docker network inspect oblak-telemetry >/dev/null 2>&1 || \
		docker network create oblak-telemetry

# Start the telemetry store and the collector
up-observability: observability-net
	docker compose -f observability/docker-compose.yml up -d

# Stop the observability stack
down-observability:
	docker compose -f observability/docker-compose.yml down

# View observability logs
logs-observability:
	docker compose -f observability/docker-compose.yml logs -f

# ============================================
# Pristaniste (Container Service) Commands
# ============================================

# Start Pristaniste. Depends on the shared telemetry network, which the observability
# target creates.
up-pristaniste: observability-net
	docker compose -f pristaniste/docker-compose.yml up -d --build

# Stop Pristaniste
down-pristaniste:
	docker compose -f pristaniste/docker-compose.yml down

# View Pristaniste logs
logs-pristaniste:
	docker compose -f pristaniste/docker-compose.yml logs -f

# ============================================
# Tefter (Database Service) Commands
# ============================================

# Start Tefter. Depends on the shared telemetry network, which the
# observability target creates. Tefter provisions database containers on
# demand, so this starts only its API.
up-tefter: observability-net
	docker compose -f tefter/docker-compose.yml up -d --build

# Stop Tefter. Provisioned database instances are NOT stopped: they are
# separate containers with their own lifecycle, and stopping the API should
# not take databases offline.
down-tefter:
	docker compose -f tefter/docker-compose.yml down

# View Tefter logs
logs-tefter:
	docker compose -f tefter/docker-compose.yml logs -f

# ============================================
# Vrata (Gateway) Commands
# ============================================

# Start Vrata. Depends on the shared telemetry network, which the observability
# target creates. Vrata is the instrumented reverse proxy in front of Pristaniste
# containers and Izvor VMs, so requests to workloads are traced and logged.
up-vrata: observability-net
	docker compose -f vrata/docker-compose.yml up -d --build

# Stop Vrata. Workloads keep running: Vrata only fronts them.
down-vrata:
	docker compose -f vrata/docker-compose.yml down

# View Vrata logs
logs-vrata:
	docker compose -f vrata/docker-compose.yml logs -f

# ============================================
# Indeks (Key/Value Store) Commands
# ============================================

# Start Indeks. Depends on the shared telemetry network. Indeks needs no
# external engine: it stores data in an embedded bbolt file in its volume.
up-indeks: observability-net
	docker compose -f indeks/docker-compose.yml up -d --build

# Stop Indeks
down-indeks:
	docker compose -f indeks/docker-compose.yml down

# View Indeks logs
logs-indeks:
	docker compose -f indeks/docker-compose.yml logs -f

# ============================================
# Red (Message Queue) Commands
# ============================================

# Start Red. Depends on the shared telemetry network. Red needs no external
# engine: queues and messages live in an embedded bbolt file in its volume.
up-red: observability-net
	docker compose -f red/docker-compose.yml up -d --build

# Stop Red
down-red:
	docker compose -f red/docker-compose.yml down

# View Red logs
logs-red:
	docker compose -f red/docker-compose.yml logs -f
