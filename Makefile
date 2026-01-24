.PHONY: all test test-impuls test-spomen test-izvor test-coverage build build-impuls build-spomen build-izvor clean help

# Default target
help:
	@echo "Oblak - Private Cloud Platform"
	@echo ""
	@echo "Usage:"
	@echo "  make test           - Run all tests"
	@echo "  make test-impuls    - Run Impuls tests only"
	@echo "  make test-spomen    - Run Spomen tests only"
	@echo "  make test-izvor     - Run Izvor tests only"
	@echo "  make test-coverage  - Run all tests with coverage"
	@echo "  make build          - Build all services"
	@echo "  make build-impuls   - Build Impuls server"
	@echo "  make build-spomen   - Build Spomen server"
	@echo "  make build-izvor    - Build Izvor server"
	@echo "  make clean          - Clean build artifacts"
	@echo ""

# Run all tests
test: test-impuls test-spomen test-izvor
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
build: build-impuls build-spomen build-izvor
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

# Clean all build artifacts
clean:
	@echo "Cleaning all build artifacts..."
	@cd impuls && make clean
	@cd spomen && rm -f spomen-server
	@cd izvor && rm -f izvor-server
	@echo "✓ Clean complete"
