#!/bin/bash
# Development mode: run without Firecracker
# Uses local Node.js for function execution

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Starting Impuls in Development Mode ==="
echo "Note: Functions will be executed locally without Firecracker"
echo ""

# Build if needed
if [ ! -f "${PROJECT_DIR}/build/impuls-server" ]; then
    "${SCRIPT_DIR}/build.sh"
fi

# Create data directory
mkdir -p /tmp/impuls/{functions,vms,logs}

# Run server
cd "${PROJECT_DIR}"
./build/impuls-server \
    --port 8080 \
    --data-dir /tmp/impuls \
    --firecracker /dev/null

echo "Server stopped"
