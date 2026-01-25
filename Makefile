.PHONY: all test test-impuls test-spomen test-izvor test-dashboard test-coverage build build-impuls build-spomen build-izvor build-dashboard clean help
.PHONY: dev dev-dashboard up down logs ps

# Default target
help:
	@echo "Oblak - Private Cloud Platform"
	@echo ""
	@echo "Usage:"
	@echo "  make test              - Run all tests"
	@echo "  make test-impuls       - Run Impuls tests only"
	@echo "  make test-spomen       - Run Spomen tests only"
	@echo "  make test-izvor        - Run Izvor tests only"
	@echo "  make test-dashboard    - Run Dashboard tests (frontend + backend)"
	@echo "  make test-coverage     - Run all tests with coverage"
	@echo "  make build             - Build all services"
	@echo "  make build-impuls      - Build Impuls server"
	@echo "  make build-spomen      - Build Spomen server"
	@echo "  make build-izvor       - Build Izvor server"
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

# Run all tests
test: test-impuls test-spomen test-izvor test-dashboard
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

# Build all services
build: build-impuls build-spomen build-izvor build-dashboard
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
