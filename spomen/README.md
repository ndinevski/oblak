# Spomen - Object Storage

Spomen is the object storage component of the private cloud, powered by [Minio](https://min.io/). It provides S3-compatible object storage that can be accessed using any S3 SDK or client.

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

## Access

- **API Endpoint**: `http://localhost:9000`
- **Web Console**: `http://localhost:9001`
- **Default Credentials**: `spomen-admin` / `spomen-secret-key` (change in production!)

## Default Buckets

The following buckets are created on first start:

| Bucket | Purpose |
|--------|---------|
| `default` | General purpose storage |
| `backups` | Backup files |
| `uploads` | User uploads |
| `public` | Publicly accessible files (anonymous read) |
| `logs` | Log files |
| `artifacts` | Build artifacts |

## Management

### Create a User

```bash
make create-user USER=myuser PASS=mysecret POLICY=readwrite
```

Available policies: `readwrite`, `readonly`, `writeonly`

### Create a Bucket

```bash
# Private bucket
make create-bucket BUCKET=mybucket

# Public bucket (anonymous read access)
make create-bucket BUCKET=mybucket PUBLIC=public
```

### View Logs

```bash
make logs
```

## Client Usage

### AWS CLI

```bash
aws configure set aws_access_key_id spomen-admin
aws configure set aws_secret_access_key spomen-secret-key

# Use with endpoint
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
    aws_secret_access_key='spomen-secret-key'
)

# List buckets
print(s3.list_buckets())

# Upload file
s3.upload_file('local-file.txt', 'default', 'remote-file.txt')

# Download file
s3.download_file('default', 'remote-file.txt', 'downloaded.txt')
```

### Go

```go
package main

import (
    "github.com/minio/minio-go/v7"
    "github.com/minio/minio-go/v7/pkg/credentials"
)

func main() {
    client, _ := minio.New("localhost:9000", &minio.Options{
        Creds:  credentials.NewStaticV4("spomen-admin", "spomen-secret-key", ""),
        Secure: false,
    })
    
    // Use client...
}
```

### JavaScript/Node.js

```javascript
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');

const client = new S3Client({
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    credentials: {
        accessKeyId: 'spomen-admin',
        secretAccessKey: 'spomen-secret-key'
    },
    forcePathStyle: true
});

const response = await client.send(new ListBucketsCommand({}));
console.log(response.Buckets);
```

### mc (Minio Client)

```bash
# Configure alias
mc alias set spomen http://localhost:9000 spomen-admin spomen-secret-key

# List buckets
mc ls spomen/

# Upload file
mc cp file.txt spomen/default/

# Download file
mc cp spomen/default/file.txt ./
```

## Production Considerations

1. **Change default credentials** in `.env`
2. **Use HTTPS** - Set up a reverse proxy with TLS
3. **Backup data** - The `./data` directory contains all storage
4. **Set resource limits** in docker-compose for production
5. **Enable versioning** for important buckets:
   ```bash
   mc version enable spomen/mybucket
   ```

## Directory Structure

```
spomen/
├── docker-compose.yml    # Service definition
├── .env.example          # Configuration template
├── .env                  # Your configuration (gitignored)
├── Makefile              # Convenience commands
├── data/                 # Minio data (gitignored)
└── scripts/
    ├── start.sh          # Start service
    ├── stop.sh           # Stop service
    ├── init-buckets.sh   # Initialize default buckets
    ├── create-user.sh    # Create new users
    └── create-bucket.sh  # Create new buckets
```

## License

MIT
