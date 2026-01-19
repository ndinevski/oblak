#!/bin/sh
set -e

echo "Waiting for Minio to be ready..."
sleep 5

# Configure mc alias
mc alias set spomen http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

# Create default buckets
echo "Creating default buckets..."

# General purpose buckets
mc mb --ignore-existing spomen/default
mc mb --ignore-existing spomen/backups
mc mb --ignore-existing spomen/uploads
mc mb --ignore-existing spomen/public

# Set public bucket policy (anonymous read access)
mc anonymous set download spomen/public

# Optional: Create buckets for specific use cases
mc mb --ignore-existing spomen/logs
mc mb --ignore-existing spomen/artifacts

# Set lifecycle rules (optional - delete old logs after 30 days)
# mc ilm rule add --expire-days 30 spomen/logs

echo "Bucket initialization complete!"
mc ls spomen/
