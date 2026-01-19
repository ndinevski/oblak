#!/bin/bash
set -e

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <username> <password> [policy]"
    echo "  policy: readwrite (default), readonly, writeonly"
    exit 1
fi

USERNAME=$1
PASSWORD=$2
POLICY=${3:-readwrite}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

MINIO_ROOT_USER=${MINIO_ROOT_USER:-spomen-admin}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-spomen-secret-key}

echo "Creating user: $USERNAME with policy: $POLICY"

docker run --rm --network spomen_spomen-network minio/mc sh -c "
    mc alias set spomen http://minio:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD'
    mc admin user add spomen '$USERNAME' '$PASSWORD'
    mc admin policy attach spomen $POLICY --user '$USERNAME'
    echo 'User created successfully!'
"
