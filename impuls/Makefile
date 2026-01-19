.PHONY: all build clean test run dev install-deps setup-images

# Variables
BINARY_NAME=impuls-server
BUILD_DIR=build
CMD_DIR=cmd/impuls-server

# Go settings
GOOS?=$(shell go env GOOS)
GOARCH?=$(shell go env GOARCH)
CGO_ENABLED?=0

all: build

# Build the server
build:
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=$(CGO_ENABLED) GOOS=$(GOOS) GOARCH=$(GOARCH) \
		go build -o $(BUILD_DIR)/$(BINARY_NAME) ./$(CMD_DIR)
	@echo "Built: $(BUILD_DIR)/$(BINARY_NAME)"

# Build for Linux (for deployment)
build-linux:
	@echo "Building for Linux..."
	GOOS=linux GOARCH=amd64 $(MAKE) build

# Clean build artifacts
clean:
	@echo "Cleaning..."
	@rm -rf $(BUILD_DIR)
	@rm -rf /tmp/impuls

# Run tests
test:
	@echo "Running tests..."
	go test -v ./...

# Run the server in development mode
dev:
	@echo "Starting in development mode..."
	@mkdir -p /tmp/impuls/{functions,vms,logs,images}
	go run ./$(CMD_DIR) \
		--port 8080 \
		--data-dir /tmp/impuls \
		--firecracker /dev/null

# Run the server (requires root for Firecracker)
run: build
	@echo "Starting server (requires root for Firecracker)..."
	sudo ./$(BUILD_DIR)/$(BINARY_NAME)

# Install dependencies
install-deps:
	@echo "Installing Go dependencies..."
	go mod download
	go mod tidy

# Setup images (requires root)
setup-images:
	@echo "Setting up Firecracker images..."
	sudo ./scripts/setup-images.sh

# Install Firecracker (requires root)
install-firecracker:
	@echo "Installing Firecracker..."
	sudo ./scripts/install-firecracker.sh

# Test the API
test-api:
	@echo "Testing API..."
	./scripts/test-api.sh

# Format code
fmt:
	@echo "Formatting code..."
	go fmt ./...

# Lint code
lint:
	@echo "Linting..."
	@if command -v golangci-lint &> /dev/null; then \
		golangci-lint run; \
	else \
		echo "golangci-lint not installed, skipping"; \
	fi

# Generate go.sum
tidy:
	go mod tidy

# Docker build (for testing without local Go)
docker-build:
	docker build -t impuls:latest .

# Help
help:
	@echo "Impuls - Serverless Functions with Firecracker"
	@echo ""
	@echo "Usage:"
	@echo "  make build            - Build the server binary"
	@echo "  make build-linux      - Build for Linux (cross-compile)"
	@echo "  make clean            - Remove build artifacts"
	@echo "  make test             - Run tests"
	@echo "  make dev              - Run in development mode (no Firecracker)"
	@echo "  make run              - Run with Firecracker (requires root)"
	@echo "  make install-deps     - Install Go dependencies"
	@echo "  make install-firecracker - Install Firecracker binary"
	@echo "  make setup-images     - Download kernel and rootfs images"
	@echo "  make test-api         - Test the API endpoints"
	@echo "  make fmt              - Format Go code"
	@echo "  make lint             - Lint Go code"
	@echo "  make help             - Show this help"
