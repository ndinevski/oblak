#!/bin/bash
# Start Impuls in Docker in development mode (no Firecracker)
# Uses local Node.js for function execution

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=== Starting Impuls FaaS (Development Mode) ==="
echo ""
echo "Note: Running without Firecracker - functions execute in local Node.js"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

# Build and start dev profile
echo "Building development Docker image..."
docker compose build impuls-dev

echo ""
echo "Starting container..."
docker compose --profile dev up -d impuls-dev

echo ""
echo "Waiting for server to be ready..."

# Wait for health check
for i in {1..30}; do
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        echo ""
        echo "✓ Server is ready!"
        echo ""
        echo "API endpoint: http://localhost:8080"
        echo ""
        echo "Note: Use ?local=true when invoking functions:"
        echo '  curl -X POST http://localhost:8080/api/v1/functions/{name}/invoke?local=true'
        echo ""
        echo "View logs:"
        echo "  docker compose logs -f impuls-dev"
        echo ""
        echo "Stop:"
        echo "  docker compose --profile dev down"
        exit 0
    fi
    echo -n "."
    sleep 1
done

echo ""
echo "⚠ Server didn't become ready in time"
echo "Check logs with: docker compose logs impuls-dev"
exit 1
