#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Load environment variables if .env exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Create data directory if it doesn't exist
mkdir -p "${MINIO_DATA_DIR:-./data}"

echo "Starting Spomen (Minio Object Storage)..."
docker compose up -d minio

echo "Waiting for Minio to be healthy..."
sleep 10

echo "Running initialization..."
docker compose up minio-init

echo ""
echo "Spomen is ready!"
echo "  API Endpoint: http://localhost:${MINIO_API_PORT:-9000}"
echo "  Console:      http://localhost:${MINIO_CONSOLE_PORT:-9001}"
echo "  User:         ${MINIO_ROOT_USER:-spomen-admin}"
