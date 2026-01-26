#!/bin/bash
# Oblak Cloud Dashboard - PostgreSQL Backup Script
# Automated backup with rotation and optional S3 upload

set -euo pipefail

# Load configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/backup.env" 2>/dev/null || true

# Default values
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="oblak_backup_${TIMESTAMP}"

# Database connection
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-strapi}"
DB_NAME="${POSTGRES_DB:-strapi}"

# Colors for output
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

# Create backup directory
mkdir -p "${BACKUP_DIR}/daily"
mkdir -p "${BACKUP_DIR}/weekly"
mkdir -p "${BACKUP_DIR}/monthly"

log_info "Starting PostgreSQL backup..."

# Create backup
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -F c \
    -b \
    -v \
    -f "${BACKUP_DIR}/daily/${BACKUP_NAME}.dump" 2>&1

if [ $? -eq 0 ]; then
    log_info "Backup created: ${BACKUP_NAME}.dump"
else
    log_error "Backup failed!"
    exit 1
fi

# Get backup size
BACKUP_SIZE=$(du -h "${BACKUP_DIR}/daily/${BACKUP_NAME}.dump" | cut -f1)
log_info "Backup size: ${BACKUP_SIZE}"

# Compress backup
log_info "Compressing backup..."
gzip "${BACKUP_DIR}/daily/${BACKUP_NAME}.dump"
COMPRESSED_SIZE=$(du -h "${BACKUP_DIR}/daily/${BACKUP_NAME}.dump.gz" | cut -f1)
log_info "Compressed size: ${COMPRESSED_SIZE}"

# Encrypt backup if key is provided
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ] && [ -f "${BACKUP_ENCRYPTION_KEY}" ]; then
    log_info "Encrypting backup..."
    gpg --encrypt --recipient-file "${BACKUP_ENCRYPTION_KEY}" \
        "${BACKUP_DIR}/daily/${BACKUP_NAME}.dump.gz"
    rm "${BACKUP_DIR}/daily/${BACKUP_NAME}.dump.gz"
    BACKUP_FILE="${BACKUP_NAME}.dump.gz.gpg"
else
    BACKUP_FILE="${BACKUP_NAME}.dump.gz"
fi

# Weekly backup (on Sunday)
if [ "$(date +%u)" -eq 7 ]; then
    log_info "Creating weekly backup copy..."
    cp "${BACKUP_DIR}/daily/${BACKUP_FILE}" "${BACKUP_DIR}/weekly/"
fi

# Monthly backup (on 1st of month)
if [ "$(date +%d)" -eq 01 ]; then
    log_info "Creating monthly backup copy..."
    cp "${BACKUP_DIR}/daily/${BACKUP_FILE}" "${BACKUP_DIR}/monthly/"
fi

# Upload to S3 if bucket is configured
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    log_info "Uploading to S3..."
    aws s3 cp "${BACKUP_DIR}/daily/${BACKUP_FILE}" \
        "s3://${BACKUP_S3_BUCKET}/daily/${BACKUP_FILE}" \
        --region "${BACKUP_S3_REGION:-us-east-1}" \
        --storage-class STANDARD_IA

    if [ "$(date +%u)" -eq 7 ]; then
        aws s3 cp "${BACKUP_DIR}/daily/${BACKUP_FILE}" \
            "s3://${BACKUP_S3_BUCKET}/weekly/${BACKUP_FILE}" \
            --region "${BACKUP_S3_REGION:-us-east-1}" \
            --storage-class STANDARD_IA
    fi

    if [ "$(date +%d)" -eq 01 ]; then
        aws s3 cp "${BACKUP_DIR}/daily/${BACKUP_FILE}" \
            "s3://${BACKUP_S3_BUCKET}/monthly/${BACKUP_FILE}" \
            --region "${BACKUP_S3_REGION:-us-east-1}" \
            --storage-class GLACIER
    fi
    log_info "S3 upload complete"
fi

# Cleanup old backups
log_info "Cleaning up old backups..."

# Daily backups - keep for BACKUP_RETENTION_DAYS days
find "${BACKUP_DIR}/daily" -name "*.dump.gz*" -mtime +${BACKUP_RETENTION_DAYS} -delete 2>/dev/null || true

# Weekly backups - keep for BACKUP_RETENTION_WEEKS weeks
WEEKLY_DAYS=$((${BACKUP_RETENTION_WEEKS:-12} * 7))
find "${BACKUP_DIR}/weekly" -name "*.dump.gz*" -mtime +${WEEKLY_DAYS} -delete 2>/dev/null || true

# Monthly backups - keep for BACKUP_RETENTION_MONTHS months
MONTHLY_DAYS=$((${BACKUP_RETENTION_MONTHS:-12} * 30))
find "${BACKUP_DIR}/monthly" -name "*.dump.gz*" -mtime +${MONTHLY_DAYS} -delete 2>/dev/null || true

# Cleanup S3 old backups
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    # S3 lifecycle rules should handle this, but we can also do it manually
    log_info "S3 cleanup managed by lifecycle rules"
fi

# Calculate remaining backups
DAILY_COUNT=$(ls -1 "${BACKUP_DIR}/daily"/*.gz* 2>/dev/null | wc -l || echo "0")
WEEKLY_COUNT=$(ls -1 "${BACKUP_DIR}/weekly"/*.gz* 2>/dev/null | wc -l || echo "0")
MONTHLY_COUNT=$(ls -1 "${BACKUP_DIR}/monthly"/*.gz* 2>/dev/null | wc -l || echo "0")

log_info "Backup stats: Daily=${DAILY_COUNT}, Weekly=${WEEKLY_COUNT}, Monthly=${MONTHLY_COUNT}"

# Send notification
if [ -n "${BACKUP_NOTIFY_SLACK_WEBHOOK:-}" ]; then
    curl -s -X POST "${BACKUP_NOTIFY_SLACK_WEBHOOK}" \
        -H 'Content-Type: application/json' \
        -d "{
            \"text\": \"✅ Oblak backup completed\",
            \"blocks\": [
                {
                    \"type\": \"section\",
                    \"text\": {
                        \"type\": \"mrkdwn\",
                        \"text\": \"*Oblak Cloud Dashboard Backup*\n✅ Backup completed successfully\n• File: ${BACKUP_FILE}\n• Size: ${COMPRESSED_SIZE}\n• Daily: ${DAILY_COUNT} | Weekly: ${WEEKLY_COUNT} | Monthly: ${MONTHLY_COUNT}\"
                    }
                }
            ]
        }" > /dev/null
fi

log_info "Backup completed successfully!"
