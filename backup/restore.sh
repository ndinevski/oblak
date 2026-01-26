#!/bin/bash
# Oblak Cloud Dashboard - PostgreSQL Restore Script
# Restore from backup file

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Usage
usage() {
    echo "Usage: $0 <backup_file> [options]"
    echo ""
    echo "Options:"
    echo "  --clean      Drop existing objects before restore"
    echo "  --no-owner   Do not restore ownership"
    echo "  --target-db  Target database name (default: from env)"
    echo "  --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 /backups/daily/oblak_backup_20240101_020000.dump.gz"
    echo "  $0 backup.dump.gz --clean --no-owner"
    exit 1
}

# Check arguments
if [ $# -lt 1 ] || [ "$1" == "--help" ]; then
    usage
fi

BACKUP_FILE="$1"
shift

# Parse options
CLEAN_FLAG=""
NO_OWNER_FLAG=""
TARGET_DB=""

while [ $# -gt 0 ]; do
    case "$1" in
        --clean)
            CLEAN_FLAG="--clean"
            ;;
        --no-owner)
            NO_OWNER_FLAG="--no-owner"
            ;;
        --target-db)
            TARGET_DB="$2"
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
    shift
done

# Database connection
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-strapi}"
DB_NAME="${TARGET_DB:-${POSTGRES_DB:-strapi}}"

# Validate backup file
if [ ! -f "${BACKUP_FILE}" ]; then
    log_error "Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

log_info "Restoring from: ${BACKUP_FILE}"
log_info "Target database: ${DB_NAME}"

# Confirm restore
echo ""
log_warn "WARNING: This will restore the database from backup."
log_warn "Existing data may be overwritten or lost."
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
    log_info "Restore cancelled"
    exit 0
fi

# Prepare backup file
RESTORE_FILE="${BACKUP_FILE}"

# Decrypt if encrypted
if [[ "${BACKUP_FILE}" == *.gpg ]]; then
    log_info "Decrypting backup..."
    RESTORE_FILE="${BACKUP_FILE%.gpg}"
    gpg --decrypt "${BACKUP_FILE}" > "${RESTORE_FILE}"
fi

# Decompress if compressed
if [[ "${RESTORE_FILE}" == *.gz ]]; then
    log_info "Decompressing backup..."
    gunzip -k "${RESTORE_FILE}"
    RESTORE_FILE="${RESTORE_FILE%.gz}"
    CLEANUP_FILE="${RESTORE_FILE}"
fi

# Perform restore
log_info "Starting restore..."

PGPASSWORD="${POSTGRES_PASSWORD}" pg_restore \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    ${CLEAN_FLAG} \
    ${NO_OWNER_FLAG} \
    -v \
    "${RESTORE_FILE}" 2>&1 || true

# Cleanup temporary files
if [ -n "${CLEANUP_FILE:-}" ] && [ -f "${CLEANUP_FILE}" ]; then
    rm -f "${CLEANUP_FILE}"
fi

log_info "Restore completed!"
log_info "Please verify your data and restart the application if needed."
