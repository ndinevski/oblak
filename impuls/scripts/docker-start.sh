#!/bin/bash
# Start Impuls in Docker with Firecracker support
# Requires: Docker with KVM support on the host

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=== Starting Impuls FaaS ==="
echo ""

# Check for KVM on host
if [ ! -e /dev/kvm ]; then
    echo "⚠ Warning: /dev/kvm not found on host"
    echo "  Firecracker requires KVM support."
    echo "  The container will run in local mode (without VM isolation)."
    echo ""
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

# Build and start
echo "Building Docker image..."
docker compose build impuls

echo ""
echo "Starting container..."
docker compose up -d impuls

echo ""
echo "=== Impuls is starting ==="
echo ""
echo "Waiting for server to be ready..."

# Wait for health check
for i in {1..30}; do
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        echo ""
        echo "✓ Server is ready!"
        echo ""
        echo "API endpoint: http://localhost:8080"
        echo "Health check: http://localhost:8080/health"
        echo ""
        echo "Quick test:"
        echo "  curl http://localhost:8080/health"
        echo ""
        echo "Create a function:"
        echo '  curl -X POST http://localhost:8080/api/v1/functions \'
        echo '    -H "Content-Type: application/json" \'
        echo '    -d '"'"'{"name":"hello","runtime":"nodejs20","handler":"index.handler","code":"exports.handler = async (e) => ({ message: \"Hello \" + (e.name || \"World\") })"}'"'"
        echo ""
        echo "Invoke a function:"
        echo '  curl -X POST http://localhost:8080/api/v1/functions/hello/invoke?local=true \'
        echo '    -H "Content-Type: application/json" \'
        echo '    -d '"'"'{"name":"Docker"}'"'"
        echo ""
        echo "View logs:"
        echo "  docker compose logs -f impuls"
        echo ""
        echo "Stop:"
        echo "  docker compose down"
        exit 0
    fi
    echo -n "."
    sleep 1
done

echo ""
echo "⚠ Server didn't become ready in time"
echo "Check logs with: docker compose logs impuls"
exit 1
