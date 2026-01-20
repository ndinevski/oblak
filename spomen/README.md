# Spomen - Object Storage Service

Spomen is the object storage component of the private cloud, powered by [Minio](https://min.io/). It provides both S3-compatible storage and a simplified REST API for bucket and object management.

## Quick Start

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your preferred settings

# Start the service
make start

# Check status
make status
```

## Endpoints

| Service | URL | Description |
|---------|-----|-------------|
| **Spomen API** | `http://localhost:8081` | REST API for storage management |
| **Minio S3** | `http://localhost:9000` | S3-compatible endpoint |
| **Minio Console** | `http://localhost:9001` | Web-based admin UI |

## API Reference

### Health Check

```bash
curl http://localhost:8081/health
```

---

### Buckets

#### List Buckets

```bash
curl http://localhost:8081/api/v1/buckets
```

#### Create Bucket

```bash
curl -X POST http://localhost:8081/api/v1/buckets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-bucket",
    "policy": "private",
    "versioning": false
  }'
```

**Policy options:** `private` (default), `public-read`, `public-read-write`

#### Get Bucket Details

```bash
curl http://localhost:8081/api/v1/buckets/my-bucket
```

#### Update Bucket

```bash
curl -X PUT http://localhost:8081/api/v1/buckets/my-bucket \
  -H "Content-Type: application/json" \
  -d '{
    "policy": "public-read",
    "versioning": true
  }'
```

#### Delete Bucket

```bash
# Delete empty bucket
curl -X DELETE http://localhost:8081/api/v1/buckets/my-bucket

# Force delete (removes all objects first)
curl -X DELETE "http://localhost:8081/api/v1/buckets/my-bucket?force=true"
```

---

### Objects

#### List Objects

```bash
# List all objects
curl http://localhost:8081/api/v1/buckets/my-bucket/objects

# With prefix filter
curl "http://localhost:8081/api/v1/buckets/my-bucket/objects?prefix=images/"

# With delimiter (directory-like listing)
curl "http://localhost:8081/api/v1/buckets/my-bucket/objects?prefix=data/&delimiter=/"

# Pagination
curl "http://localhost:8081/api/v1/buckets/my-bucket/objects?max_keys=100&marker=last-key"
```

#### Upload Object

```bash
# Simple upload
curl -X PUT http://localhost:8081/api/v1/buckets/my-bucket/objects/path/to/file.txt \
  -H "Content-Type: text/plain" \
  -d "Hello, World!"

# Upload with custom metadata
curl -X PUT http://localhost:8081/api/v1/buckets/my-bucket/objects/document.pdf \
  -H "Content-Type: application/pdf" \
  -H "X-Meta-Author: John Doe" \
  -H "X-Meta-Version: 1.0" \
  --data-binary @document.pdf
```

#### Download Object

```bash
curl http://localhost:8081/api/v1/buckets/my-bucket/objects/path/to/file.txt
```

#### Get Object Info (Metadata Only)

```bash
curl "http://localhost:8081/api/v1/buckets/my-bucket/objects/path/to/file.txt?info=true"
```

#### Delete Object

```bash
curl -X DELETE http://localhost:8081/api/v1/buckets/my-bucket/objects/path/to/file.txt
```

#### Delete Multiple Objects

```bash
curl -X POST http://localhost:8081/api/v1/buckets/my-bucket/delete \
  -H "Content-Type: application/json" \
  -d '{
    "keys": ["file1.txt", "file2.txt", "images/photo.jpg"]
  }'
```

#### Copy Object

```bash
curl -X POST "http://localhost:8081/api/v1/buckets/dest-bucket/objects/new-file.txt?action=copy" \
  -H "Content-Type: application/json" \
  -d '{
    "source_bucket": "source-bucket",
    "source_key": "original-file.txt",
    "dest_key": "new-file.txt"
  }'
```

---

### Presigned URLs

Generate temporary URLs for direct upload/download:

```bash
# Generate download URL (valid for 1 hour)
curl -X POST http://localhost:8081/api/v1/buckets/my-bucket/presign \
  -H "Content-Type: application/json" \
  -d '{
    "key": "private-file.pdf",
    "method": "GET",
    "expires_in": 3600
  }'

# Generate upload URL
curl -X POST http://localhost:8081/api/v1/buckets/my-bucket/presign \
  -H "Content-Type: application/json" \
  -d '{
    "key": "uploads/new-file.pdf",
    "method": "PUT",
    "expires_in": 600
  }'
```

---

## Direct S3 Access

You can also use any S3 SDK directly with the Minio endpoint:

### AWS CLI

```bash
aws configure set aws_access_key_id spomen-admin
aws configure set aws_secret_access_key your-secret-key

aws --endpoint-url http://localhost:9000 s3 ls
aws --endpoint-url http://localhost:9000 s3 cp file.txt s3://default/
```

### Python (boto3)

```python
import boto3

s3 = boto3.client(
    's3',
    endpoint_url='http://localhost:9000',
    aws_access_key_id='spomen-admin',
    aws_secret_access_key='your-secret-key'
)

# Upload
s3.upload_file('local.txt', 'default', 'remote.txt')

# Download
s3.download_file('default', 'remote.txt', 'local.txt')
```

### Go

```go
import "github.com/minio/minio-go/v7"

client, _ := minio.New("localhost:9000", &minio.Options{
    Creds:  credentials.NewStaticV4("spomen-admin", "your-secret-key", ""),
    Secure: false,
})
```

---

## Default Buckets

| Bucket | Policy | Purpose |
|--------|--------|---------|
| `default` | private | General purpose storage |
| `backups` | private | Backup files |
| `uploads` | private | User uploads |
| `public` | public-read | Publicly accessible files |
| `logs` | private | Log files |
| `artifacts` | private | Build artifacts |

---

## Development

### Run Locally

```bash
# Start Minio only
docker compose up -d minio

# Run API server locally
make dev
```

### Build

```bash
make build
```

---

## Project Structure

```
spomen/
├── cmd/
│   └── spomen-server/
│       └── main.go           # Entry point
├── internal/
│   ├── api/
│   │   ├── server.go         # HTTP server
│   │   ├── bucket_routes.go  # Bucket endpoints
│   │   └── object_routes.go  # Object endpoints
│   ├── models/
│   │   ├── bucket.go         # Bucket models
│   │   └── object.go         # Object models
│   └── storage/
│       └── client.go         # Minio client wrapper
├── scripts/
│   ├── start.sh
│   ├── stop.sh
│   ├── init-buckets.sh
│   ├── create-user.sh
│   └── create-bucket.sh
├── docker-compose.yml
├── Dockerfile
├── Makefile
└── go.mod
```

---

## License

MIT
