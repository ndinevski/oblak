#!/bin/bash
# Build script for Impuls

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="${PROJECT_DIR}/build"

echo "=== Building Impuls ==="

# Create build directory
mkdir -p "${BUILD_DIR}"

# Build the server
echo "Building impuls-server..."
cd "${PROJECT_DIR}/cmd/impuls-server"
go build -o "${BUILD_DIR}/impuls-server" .

echo ""
echo "=== Build Complete ==="
echo "Binary: ${BUILD_DIR}/impuls-server"
echo ""
echo "Run with: sudo ${BUILD_DIR}/impuls-server"
