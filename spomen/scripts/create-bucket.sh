#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <bucket-name> [public]"
    echo "  Add 'public' as second argument to make bucket publicly readable"
    exit 1
fi

BUCKET=$1
PUBLIC=$2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

MINIO_ROOT_USER=${MINIO_ROOT_USER:-spomen-admin}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-spomen-secret-key}

echo "Creating bucket: $BUCKET"

docker run --rm --network spomen_spomen-network minio/mc sh -c "
    mc alias set spomen http://minio:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD'
    mc mb --ignore-existing spomen/$BUCKET
    $([ "$PUBLIC" = "public" ] && echo "mc anonymous set download spomen/$BUCKET")
    echo 'Bucket created!'
    mc ls spomen/
"
