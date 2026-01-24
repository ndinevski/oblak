#!/bin/bash

# Start Izvor service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Check for .env file
if [ ! -f .env ]; then
    echo "Warning: .env file not found. Copying from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "Please edit .env with your Proxmox configuration"
        exit 1
    else
        echo "Error: .env.example not found"
        exit 1
    fi
fi

# Source environment variables
source .env

# Validate required variables
if [ -z "$PROXMOX_URL" ]; then
    echo "Error: PROXMOX_URL is required. Please set it in .env"
    exit 1
fi

echo "Starting Izvor VM Service..."
echo "  Proxmox URL: $PROXMOX_URL"
echo "  API Port: ${IZVOR_API_PORT:-8082}"

# Start with Docker Compose
docker compose up -d

echo ""
echo "Izvor service started!"
echo "  API: http://localhost:${IZVOR_API_PORT:-8082}"
echo ""
echo "Check status: make status"
echo "View logs: make logs"
