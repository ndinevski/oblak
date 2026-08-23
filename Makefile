.PHONY: all test test-impuls test-spomen test-izvor test-brod test-tefter test-vrata test-dashboard test-coverage build build-impuls build-spomen build-izvor build-brod build-tefter build-vrata build-dashboard clean help
.PHONY: dev dev-dashboard up down logs ps
.PHONY: up-polaroid down-polaroid logs-polaroid
.PHONY: up-observability down-observability logs-observability observability-net
.PHONY: up-brod down-brod logs-brod
.PHONY: up-tefter down-tefter logs-tefter
.PHONY: up-vrata down-vrata logs-vrata

# Default target
help:
	@echo "Oblak - Private Cloud Platform"
	@echo ""
	@echo "Usage:"
	@echo "  make test              - Run all tests"
	@echo "  make test-impuls       - Run Impuls tests only"
	@echo "  make test-spomen       - Run Spomen tests only"
	@echo "  make test-izvor        - Run Izvor tests only"
	@echo "  make test-brod         - Run Brod tests only"
	@echo "  make test-tefter       - Run Tefter tests only"
	@echo "  make test-vrata        - Run Vrata tests only"
	@echo "  make test-dashboard    - Run Dashboard tests (frontend + backend)"
	@echo "  make test-coverage     - Run all tests with coverage"
	@echo "  make build             - Build all services"
	@echo "  make build-impuls      - Build Impuls server"
	@echo "  make build-spomen      - Build Spomen server"
	@echo "  make build-izvor       - Build Izvor server"
	@echo "  make build-brod        - Build Brod server"
	@echo "  make build-tefter      - Build Tefter server"
	@echo "  make build-vrata       - Build Vrata gateway"
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
	@echo "Brod (Containers):"
	@echo "  make up-brod           - Start Brod API and image registry"
	@echo "  make down-brod         - Stop Brod"
	@echo "  make logs-brod         - View Brod logs"
	@echo "  make up-tefter         - Start the Tefter database API"
	@echo "  make down-tefter       - Stop Tefter"
	@echo "  make logs-tefter       - View Tefter logs"
	@echo "  make up-vrata          - Start the Vrata gateway"
	@echo "  make down-vrata        - Stop Vrata"
	@echo "  make logs-vrata        - View Vrata logs"
	@echo ""
	@echo "Observability (OpenTelemetry + ClickHouse):"
	@echo "  make up-observability   - Start ClickHouse and the OTel collector"
	@echo "  make down-observability - Stop the observability stack"
	@echo "  make logs-observability - View collector and ClickHouse logs"
	@echo ""

# Run all tests
test: test-impuls test-spomen test-izvor test-brod test-tefter test-vrata test-dashboard
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

# Run Brod tests
test-brod:
	@echo "Running Brod tests..."
	@cd brod && go test -v ./...

# Run Tefter tests
test-tefter:
	@echo "Running Tefter tests..."
	@cd tefter && go test -v ./...

# Run Vrata tests
test-vrata:
	@echo "Running Vrata tests..."
	@cd vrata && go test -v ./...

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
	@echo "=== Brod Coverage ==="
	@cd brod && go test -cover ./...
	@cd tefter && go test -cover ./...
	@cd vrata && go test -cover ./...

# Build all services
build: build-impuls build-spomen build-izvor build-brod build-tefter build-vrata build-dashboard
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

# Build Brod
build-brod:
	@echo "Building Brod..."
	@cd brod && make build

# Build Tefter
build-tefter:
	@echo "Building Tefter..."
	@cd tefter && make build

# Build Vrata
build-vrata:
	@echo "Building Vrata..."
	@cd vrata && make build

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
	@cd brod && rm -f brod-server
	@cd tefter && rm -f tefter-server
	@cd vrata && rm -f vrata-server
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
# Brod (Container Service) Commands
# ============================================

# Start Brod. Depends on the shared telemetry network, which the observability
# target creates.
up-brod: observability-net
	docker compose -f brod/docker-compose.yml up -d --build

# Stop Brod
down-brod:
	docker compose -f brod/docker-compose.yml down

# View Brod logs
logs-brod:
	docker compose -f brod/docker-compose.yml logs -f

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
# target creates. Vrata is the instrumented reverse proxy in front of Brod
# containers and Izvor VMs, so requests to workloads are traced and logged.
up-vrata: observability-net
	docker compose -f vrata/docker-compose.yml up -d --build

# Stop Vrata. Workloads keep running: Vrata only fronts them.
down-vrata:
	docker compose -f vrata/docker-compose.yml down

# View Vrata logs
logs-vrata:
	docker compose -f vrata/docker-compose.yml logs -f
