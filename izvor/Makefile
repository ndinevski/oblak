.PHONY: build start stop restart logs status test dev clean help

# Default target
help:
	@echo "Izvor - VM Provisioning Service"
	@echo ""
	@echo "Usage:"
	@echo "  make build          - Build the API server"
	@echo "  make test           - Run tests"
	@echo "  make dev            - Run locally for development"
	@echo "  make start          - Start the service (Docker)"
	@echo "  make stop           - Stop the service"
	@echo "  make restart        - Restart the service"
	@echo "  make logs           - View logs"
	@echo "  make status         - Check service status"
	@echo "  make clean          - Clean build artifacts"
	@echo ""
	@echo "Environment Variables:"
	@echo "  PROXMOX_URL         - Proxmox API URL (required)"
	@echo "  PROXMOX_USER        - Proxmox user (default: root@pam)"
	@echo "  PROXMOX_PASSWORD    - Proxmox password"
	@echo "  PROXMOX_TOKEN_ID    - API token ID (alternative to password)"
	@echo "  PROXMOX_TOKEN_SECRET- API token secret"
	@echo "  PROXMOX_NODE        - Default node name"
	@echo ""

# Variables
BINARY_NAME=izvor-server
BUILD_DIR=build
CMD_DIR=cmd/izvor-server

# Go settings
GOOS?=$(shell go env GOOS)
GOARCH?=$(shell go env GOARCH)
CGO_ENABLED?=0

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

test:
	@echo "Running tests..."
	go test -v ./...

# Run in development mode
dev: build
	@echo "Starting in development mode..."
	./$(BUILD_DIR)/$(BINARY_NAME) \
		--port 8082 \
		--proxmox-url $${PROXMOX_URL:-https://localhost:8006} \
		--proxmox-user $${PROXMOX_USER:-root@pam} \
		--proxmox-password $${PROXMOX_PASSWORD:-} \
		--insecure

# Docker commands
start:
	@./scripts/start.sh

stop:
	@./scripts/stop.sh

restart: stop start

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f izvor-api

status:
	@docker compose ps
	@echo ""
	@curl -s http://localhost:8082/health | jq . 2>/dev/null || echo "API not running"

# Clean build artifacts
clean:
	@echo "Cleaning..."
	@rm -rf $(BUILD_DIR)
	@rm -f $(BINARY_NAME)

# Install dependencies
deps:
	@echo "Installing Go dependencies..."
	go mod download
	go mod tidy

# Format code
fmt:
	go fmt ./...

# Lint code
lint:
	golangci-lint run

# Docker build
docker-build:
	docker build -t izvor:latest .

# Run in Docker
docker-run:
	docker run -it --rm \
		-p 8082:8082 \
		-e PROXMOX_URL=$${PROXMOX_URL} \
		-e PROXMOX_USER=$${PROXMOX_USER:-root@pam} \
		-e PROXMOX_PASSWORD=$${PROXMOX_PASSWORD} \
		-e PROXMOX_NODE=$${PROXMOX_NODE} \
		izvor:latest
