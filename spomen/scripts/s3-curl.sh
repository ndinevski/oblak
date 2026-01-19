#!/bin/bash
# Direct S3 API calls with AWS Signature v4
# Usage: ./s3-curl.sh <method> <bucket> [object] [data]

set -e

ENDPOINT="http://localhost:9000"
ACCESS_KEY="spomen-admin"
SECRET_KEY="ASDBASDASDAFasdfasdvASDasDVasdavsdavdabsaddfasdasD"
REGION="us-east-1"
SERVICE="s3"

METHOD="${1:-GET}"
BUCKET="${2:-}"
OBJECT="${3:-}"
DATA="${4:-}"

# Current timestamp
DATE_ISO=$(date -u +"%Y%m%dT%H%M%SZ")
DATE_SHORT=$(date -u +"%Y%m%d")

# Build path
if [ -n "$BUCKET" ] && [ -n "$OBJECT" ]; then
    PATH_URI="/${BUCKET}/${OBJECT}"
elif [ -n "$BUCKET" ]; then
    PATH_URI="/${BUCKET}"
else
    PATH_URI="/"
fi

# Content hash
if [ -n "$DATA" ]; then
    PAYLOAD_HASH=$(echo -n "$DATA" | sha256sum | cut -d' ' -f1)
    CONTENT_LENGTH=${#DATA}
else
    PAYLOAD_HASH=$(echo -n "" | sha256sum | cut -d' ' -f1)
    CONTENT_LENGTH=0
fi

HOST="localhost:9000"

# Canonical request
CANONICAL_REQUEST="${METHOD}
${PATH_URI}

host:${HOST}
x-amz-content-sha256:${PAYLOAD_HASH}
x-amz-date:${DATE_ISO}

host;x-amz-content-sha256;x-amz-date
${PAYLOAD_HASH}"

# String to sign
CANONICAL_HASH=$(echo -n "$CANONICAL_REQUEST" | sha256sum | cut -d' ' -f1)
STRING_TO_SIGN="AWS4-HMAC-SHA256
${DATE_ISO}
${DATE_SHORT}/${REGION}/${SERVICE}/aws4_request
${CANONICAL_HASH}"

# Signing key
hmac_sha256() {
    printf '%s' "$2" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$1" | cut -d' ' -f2
}

hmac_sha256_key() {
    printf '%s' "$2" | openssl dgst -sha256 -mac HMAC -macopt "key:$1" -binary | xxd -p -c 256
}

DATE_KEY=$(hmac_sha256_key "AWS4${SECRET_KEY}" "${DATE_SHORT}")
DATE_REGION_KEY=$(hmac_sha256 "${DATE_KEY}" "${REGION}")
DATE_REGION_SERVICE_KEY=$(hmac_sha256 "${DATE_REGION_KEY}" "${SERVICE}")
SIGNING_KEY=$(hmac_sha256 "${DATE_REGION_SERVICE_KEY}" "aws4_request")

# Signature
SIGNATURE=$(hmac_sha256 "${SIGNING_KEY}" "${STRING_TO_SIGN}")

# Authorization header
AUTH_HEADER="AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${DATE_SHORT}/${REGION}/${SERVICE}/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${SIGNATURE}"

echo "=== S3 API Request ==="
echo "URL: ${ENDPOINT}${PATH_URI}"
echo ""

if [ -n "$DATA" ]; then
    curl -s -X "${METHOD}" "${ENDPOINT}${PATH_URI}" \
        -H "Host: ${HOST}" \
        -H "x-amz-date: ${DATE_ISO}" \
        -H "x-amz-content-sha256: ${PAYLOAD_HASH}" \
        -H "Authorization: ${AUTH_HEADER}" \
        -H "Content-Length: ${CONTENT_LENGTH}" \
        -d "${DATA}"
else
    curl -s -X "${METHOD}" "${ENDPOINT}${PATH_URI}" \
        -H "Host: ${HOST}" \
        -H "x-amz-date: ${DATE_ISO}" \
        -H "x-amz-content-sha256: ${PAYLOAD_HASH}" \
        -H "Authorization: ${AUTH_HEADER}"
fi
echo ""
