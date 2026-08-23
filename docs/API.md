# Oblak Cloud Dashboard API Documentation

## Base URL

```
http://localhost:1337/api
```

## Authentication

All API endpoints (except auth) require authentication using JWT tokens.

### Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

---

## Authentication Endpoints

### Register User

```http
POST /auth/local/register
```

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

**Response (200):**
```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com",
    "confirmed": true,
    "blocked": false,
    "createdAt": "2026-01-25T10:00:00.000Z",
    "updatedAt": "2026-01-25T10:00:00.000Z"
  }
}
```

### Login

```http
POST /auth/local
```

**Request Body:**
```json
{
  "identifier": "string (email or username)",
  "password": "string"
}
```

**Response (200):**
```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com"
  }
}
```

### Get Current User

```http
GET /users/me
```

**Response (200):**
```json
{
  "id": 1,
  "username": "johndoe",
  "email": "john@example.com",
  "organization": "Acme Corp",
  "createdAt": "2026-01-25T10:00:00.000Z"
}
```

### Forgot Password

```http
POST /auth/forgot-password
```

**Request Body:**
```json
{
  "email": "string"
}
```

**Response (200):**
```json
{
  "ok": true
}
```

### Reset Password

```http
POST /auth/reset-password
```

**Request Body:**
```json
{
  "code": "string (from email)",
  "password": "string",
  "passwordConfirmation": "string"
}
```

**Response (200):**
```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

---

## Functions (Impuls) Endpoints

### List Functions

```http
GET /functions
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default: 1) |
| pageSize | number | Items per page (default: 25) |
| filters[status][$eq] | string | Filter by status |
| sort | string | Sort field (e.g., "createdAt:desc") |

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "documentId": "abc123",
      "name": "my-function",
      "runtime": "nodejs20",
      "status": "active",
      "memory": 256,
      "timeout": 30,
      "createdAt": "2026-01-25T10:00:00.000Z",
      "updatedAt": "2026-01-25T10:00:00.000Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 25,
      "pageCount": 1,
      "total": 1
    }
  }
}
```

### Get Function

```http
GET /functions/:documentId
```

**Response (200):**
```json
{
  "data": {
    "id": 1,
    "documentId": "abc123",
    "name": "my-function",
    "runtime": "nodejs20",
    "status": "active",
    "memory": 256,
    "timeout": 30,
    "entryPoint": "handler",
    "environmentVariables": {
      "NODE_ENV": "production"
    },
    "invocationCount": 1500,
    "lastInvokedAt": "2026-01-26T15:30:00.000Z",
    "createdAt": "2026-01-25T10:00:00.000Z",
    "updatedAt": "2026-01-25T10:00:00.000Z"
  }
}
```

### Create Function

```http
POST /functions
```

**Request Body:**
```json
{
  "data": {
    "name": "string",
    "runtime": "nodejs20 | python312 | dotnet8",
    "memory": 256,
    "timeout": 30,
    "entryPoint": "handler",
    "code": "base64 encoded code",
    "environmentVariables": {
      "KEY": "value"
    }
  }
}
```

**Response (201):**
```json
{
  "data": {
    "id": 1,
    "documentId": "abc123",
    "name": "my-function",
    "runtime": "nodejs20",
    "status": "deploying"
  }
}
```

### Update Function

```http
PUT /functions/:documentId
```

**Request Body:**
```json
{
  "data": {
    "memory": 512,
    "timeout": 60,
    "environmentVariables": {
      "KEY": "new-value"
    }
  }
}
```

### Delete Function

```http
DELETE /functions/:documentId
```

**Response (204):** No Content

### Invoke Function

```http
POST /functions/:documentId/invoke
```

**Request Body:**
```json
{
  "payload": { ... },
  "async": false
}
```

**Response (200):**
```json
{
  "data": {
    "result": { ... },
    "duration": 150,
    "statusCode": 200,
    "logs": [
      "Log line 1",
      "Log line 2"
    ]
  }
}
```

### Get Function Logs

```http
GET /functions/:documentId/logs
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| limit | number | Number of log entries (default: 100) |
| startTime | string | ISO date for log start |
| endTime | string | ISO date for log end |

**Response (200):**
```json
{
  "data": [
    {
      "timestamp": "2026-01-26T15:30:00.000Z",
      "level": "info",
      "message": "Function invoked",
      "requestId": "req-123"
    }
  ]
}
```

### Get Function Metrics

```http
GET /functions/:documentId/metrics
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| period | string | Time period (1h, 24h, 7d, 30d) |

**Response (200):**
```json
{
  "data": {
    "invocations": 1500,
    "errors": 5,
    "errorRate": 0.33,
    "avgDuration": 150,
    "p50Duration": 120,
    "p95Duration": 300,
    "p99Duration": 500,
    "memoryUsage": 200
  }
}
```

---

## Virtual Machines (Izvor) Endpoints

### List VMs

```http
GET /virtual-machines
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number |
| pageSize | number | Items per page |
| filters[status][$eq] | string | Filter by status |

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "documentId": "vm-123",
      "name": "my-vm",
      "status": "running",
      "os": "ubuntu-22.04",
      "cores": 2,
      "memory": 2048,
      "disk": 50,
      "ipAddress": "192.168.1.100",
      "createdAt": "2026-01-25T10:00:00.000Z"
    }
  ],
  "meta": { ... }
}
```

### Get VM

```http
GET /virtual-machines/:documentId
```

### Create VM

```http
POST /virtual-machines
```

**Request Body:**
```json
{
  "data": {
    "name": "string",
    "os": "ubuntu-22.04 | debian-12 | rocky-9",
    "cores": 2,
    "memory": 2048,
    "disk": 50,
    "sshKey": "ssh-rsa AAAA...",
    "userData": "#!/bin/bash\necho hello"
  }
}
```

**Response (201):**
```json
{
  "data": {
    "id": 1,
    "documentId": "vm-123",
    "name": "my-vm",
    "status": "creating"
  }
}
```

### Start VM

```http
POST /virtual-machines/:documentId/start
```

**Response (200):**
```json
{
  "data": {
    "documentId": "vm-123",
    "status": "running"
  }
}
```

### Stop VM

```http
POST /virtual-machines/:documentId/stop
```

### Restart VM

```http
POST /virtual-machines/:documentId/restart
```

### Delete VM

```http
DELETE /virtual-machines/:documentId
```

### Resize VM

```http
POST /virtual-machines/:documentId/resize
```

**Request Body:**
```json
{
  "cores": 4,
  "memory": 4096,
  "disk": 100
}
```

### Get Console

```http
GET /virtual-machines/:documentId/console
```

**Response (200):**
```json
{
  "data": {
    "url": "wss://console.oblak.local/vm-123",
    "token": "console-token"
  }
}
```

### List Snapshots

```http
GET /virtual-machines/:documentId/snapshots
```

### Create Snapshot

```http
POST /virtual-machines/:documentId/snapshots
```

**Request Body:**
```json
{
  "name": "pre-upgrade",
  "description": "Before system upgrade"
}
```

### Restore Snapshot

```http
POST /virtual-machines/:documentId/snapshots/:snapshotId/restore
```

### Delete Snapshot

```http
DELETE /virtual-machines/:documentId/snapshots/:snapshotId
```

---

## Storage (Spomen) Endpoints

### List Buckets

```http
GET /buckets
```

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "documentId": "bucket-123",
      "name": "my-bucket",
      "accessPolicy": "private",
      "versioning": false,
      "encryption": true,
      "objectCount": 150,
      "totalSize": 1073741824,
      "createdAt": "2026-01-25T10:00:00.000Z"
    }
  ],
  "meta": { ... }
}
```

### Get Bucket

```http
GET /buckets/:documentId
```

### Create Bucket

```http
POST /buckets
```

**Request Body:**
```json
{
  "data": {
    "name": "string (3-63 chars, lowercase)",
    "accessPolicy": "private | public-read | authenticated-read",
    "versioning": false,
    "encryption": true
  }
}
```

### Delete Bucket

```http
DELETE /buckets/:documentId
```

### Update Bucket Policy

```http
PUT /buckets/:documentId/policy
```

**Request Body:**
```json
{
  "accessPolicy": "public-read"
}
```

### List Objects

```http
GET /buckets/:documentId/objects
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| prefix | string | Filter by key prefix |
| delimiter | string | Delimiter for hierarchy |
| maxKeys | number | Max items to return |
| continuationToken | string | For pagination |

**Response (200):**
```json
{
  "data": {
    "objects": [
      {
        "key": "folder/file.txt",
        "size": 1024,
        "lastModified": "2026-01-26T10:00:00.000Z",
        "contentType": "text/plain",
        "etag": "d41d8cd98f00b204e9800998ecf8427e"
      }
    ],
    "prefixes": ["folder/subfolder/"],
    "isTruncated": false,
    "nextContinuationToken": null
  }
}
```

### Upload Object

```http
POST /buckets/:documentId/objects
```

**Request (multipart/form-data):**
| Field | Type | Description |
|-------|------|-------------|
| file | File | The file to upload |
| key | string | Object key (path) |
| contentType | string | MIME type (optional) |

### Download Object

```http
GET /buckets/:documentId/objects/:key
```

**Response:** File content with appropriate Content-Type header

### Delete Object

```http
DELETE /buckets/:documentId/objects/:key
```

### Get Object Metadata

```http
HEAD /buckets/:documentId/objects/:key
```

---

## Containers (Brod) Endpoints

Brod is the container service (image registry + container runtime, ECR/ECS
shaped). The dashboard proxies it through Strapi, which adds authentication and
audit; every route below is under `/api/brod`. Failures are returned with the
same status code Brod used.

### Service

```http
GET  /brod/health          # Brod service health (engine + registry)
GET  /brod/registry        # Where to push and pull images
```

### Repositories & Images

```http
GET    /brod/repositories                       # List image repositories
POST   /brod/repositories                       # Declare a repository { name, description? }
GET    /brod/repositories/:name                 # Get one repository
DELETE /brod/repositories/:name                 # Delete a repository
GET    /brod/repositories/:name/images          # List image tags
DELETE /brod/repositories/:name/images/:tag     # Delete an image tag
```

A repository name may contain slashes ("team/app"); the components are
individually URL-encoded.

### Containers

```http
GET    /brod/containers              # List containers (?all=true|false)
POST   /brod/containers              # Run a container { name, image, ports?, env?, volumes?, ... }
GET    /brod/containers/:id          # Get one container
DELETE /brod/containers/:id          # Remove a container (?force=true|false)
POST   /brod/containers/:id/start    # Start
POST   /brod/containers/:id/stop     # Stop { timeout_seconds? }
POST   /brod/containers/:id/restart  # Restart { timeout_seconds? }
GET    /brod/containers/:id/logs     # Container logs (?tail=N)
GET    /brod/containers/:id/stats    # Live resource usage
```

Images are pushed with the standard `docker` CLI to the registry reported by
`GET /brod/registry`; the API only manages what has been pushed.

---

## Databases (Tefter) Endpoints

Tefter is the managed-database service (PostgreSQL and MySQL, RDS shaped),
proxied under `/api/tefter`.

### Catalogue

```http
GET /tefter/health     # Service health and instance count
GET /tefter/engines    # Supported engines and versions
GET /tefter/sizes      # Available instance sizes
```

### Instances

```http
GET    /tefter/instances                  # List instances
POST   /tefter/instances                  # Provision { name, engine, version?, size? }
GET    /tefter/instances/:name            # Get one instance
DELETE /tefter/instances/:name            # Delete an instance and its data volume
POST   /tefter/instances/:name/start      # Start
POST   /tefter/instances/:name/stop       # Stop
```

The create response includes the generated password **once**; it cannot be
recovered afterwards.

### Read Replicas

```http
GET  /tefter/instances/:name/replicas     # List replicas of an instance
POST /tefter/instances/:name/replicas     # Create a read replica { name, size? }
GET  /tefter/instances/:name/replication  # Replication state and lag
POST /tefter/instances/:name/promote      # Promote a replica to a standalone primary (one-way)
```

### Backups

```http
GET    /tefter/instances/:name/backups    # Backups of one instance
POST   /tefter/instances/:name/backups    # Back up an instance { description? }
GET    /tefter/backups                    # List all backups
GET    /tefter/backups/:id                # Get one backup
DELETE /tefter/backups/:id                # Delete a backup
POST   /tefter/backups/restore            # Restore { backup_id, target_instance?, confirm, allow_different_instance? }
```

A restore requires `confirm: true`. Restoring a backup into an instance it did
not come from (including a new instance that reuses a deleted one's name)
additionally requires `allow_different_instance: true`.

---

## Gateway (Vrata) Endpoints

Vrata is the observability gateway: an instrumented reverse proxy in front of
Brod containers and Izvor VMs, so requests to workloads are traced and logged.
Its route-management API is proxied under `/api/vrata`. Proxied workload traffic
itself goes to Vrata's data-plane port (default 8090), not through Strapi.

```http
GET    /vrata/health           # Service health and route count
GET    /vrata/routes           # List routes
POST   /vrata/routes           # Create a route { name, kind, upstream, host?, strip_prefix?, target? }
GET    /vrata/routes/:name     # Get one route
DELETE /vrata/routes/:name     # Delete a route
```

`kind` is `container`, `vm` or `custom`. A route matches by Host header (path
preserved) or by leading path segment (`/<name>/...`, prefix stripped).

Routes carry a `source`: `manual` for ones created through this API, or `brod`
for ones Vrata auto-discovered from running Brod containers. Auto-discovery
(when `VRATA_BROD_URL` is set) keeps a route per running container that
publishes a port, and never modifies or removes a `manual` route.

---

## Observability Endpoints

Telemetry (traces, logs, metrics) and alert rules are served under
`/api/telemetry` and `/api/alert-rules`. These read from the ClickHouse
telemetry store rather than Strapi's own database.

```http
GET  /telemetry/summary                    # Platform-wide RED summary
GET  /telemetry/service-overview           # Per-service rate/errors/latency
GET  /telemetry/services                   # Services seen in the telemetry store
GET  /telemetry/timeseries/requests        # Request volume over time
GET  /telemetry/endpoints                  # Top endpoints
GET  /telemetry/containers                 # Per-container resource usage
GET  /telemetry/logs                       # Structured log search
GET  /telemetry/traces                     # Trace search
GET  /telemetry/traces/:id                 # One trace's spans
GET  /telemetry/service-map                # Cross-service call graph
GET  /telemetry/metrics                    # Metric catalogue and series

GET    /alert-rules                        # List alert rules
POST   /alert-rules                        # Create a rule
GET    /alert-rules/types                  # Catalogue of rule types (for the form)
PUT    /alert-rules/:id                    # Update a rule
DELETE /alert-rules/:id                    # Delete a rule
POST   /alert-rules/:id/mute               # Mute a rule
GET    /alert-rules/:id/history            # A rule's state history
POST   /alert-rules/test                   # Evaluate a rule definition without saving it
```

---

## Activity Log Endpoints

### List Activity Logs

```http
GET /activity-logs
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number |
| pageSize | number | Items per page |
| filters[resourceType][$eq] | string | Filter by resource type |
| filters[action][$eq] | string | Filter by action |
| sort | string | Sort field |

**Response (200):**
```json
{
  "data": [
    {
      "id": 1,
      "documentId": "log-123",
      "resourceType": "function",
      "resourceId": "fn-123",
      "action": "invoke",
      "status": "success",
      "details": { ... },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2026-01-26T15:30:00.000Z"
    }
  ],
  "meta": { ... }
}
```

### Get Activity Summary

```http
GET /activity-logs/summary
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| period | string | Time period (24h, 7d, 30d) |

**Response (200):**
```json
{
  "data": {
    "total": 1500,
    "byResourceType": {
      "function": 800,
      "vm": 400,
      "bucket": 300
    },
    "byAction": {
      "create": 100,
      "update": 200,
      "delete": 50,
      "invoke": 1150
    },
    "byStatus": {
      "success": 1450,
      "error": 50
    }
  }
}
```

---

## Quota Endpoints

### Get Quota Info

```http
GET /quota
```

**Response (200):**
```json
{
  "data": {
    "limits": {
      "functions": 20,
      "invocationsPerDay": 10000,
      "vms": 5,
      "totalCores": 32,
      "totalMemory": 32768,
      "totalDisk": 500,
      "buckets": 10,
      "storageBytes": 10737418240
    },
    "usage": {
      "functions": 5,
      "invocationsToday": 1500,
      "vms": 2,
      "usedCores": 4,
      "usedMemory": 4096,
      "usedDisk": 100,
      "buckets": 3,
      "usedStorage": 2147483648
    }
  }
}
```

### Get Quota Usage

```http
GET /quota/usage
```

### Get Quota Limits

```http
GET /quota/limits
```

---

## Health Check

```http
GET /health
```

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-26T15:30:00.000Z",
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "impuls": "healthy",
    "izvor": "healthy",
    "spomen": "healthy",
    "brod": "healthy",
    "tefter": "healthy",
    "vrata": "healthy"
  }
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "status": 400,
    "name": "ValidationError",
    "message": "Invalid input",
    "details": {
      "errors": [
        {
          "path": ["data", "name"],
          "message": "Name is required"
        }
      ]
    }
  }
}
```

### Common Error Codes

| Status | Description |
|--------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation failed |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## Rate Limiting

API requests are rate limited per user:

- 100 requests per minute for general endpoints
- 1000 requests per minute for function invocations
- 10 requests per minute for resource creation

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1706284800
```

---

## Webhooks (Future)

Webhooks for resource events will be available in a future release.
