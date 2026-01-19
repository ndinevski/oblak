# Impuls API Reference

## Base URL

All API endpoints are prefixed with `/api/v1`.

## Health Check

### GET /health

Check service health.

**Response**
```json
{
  "status": "healthy",
  "service": "impuls"
}
```

---

## Functions

### Create Function

**POST** `/api/v1/functions`

Create a new serverless function.

**Request Body**
```json
{
  "name": "my-function",
  "description": "Optional description",
  "runtime": "nodejs20",
  "handler": "index.handler",
  "code": "exports.handler = async (event) => { return { message: 'Hello!' }; }",
  "memory_mb": 128,
  "timeout_sec": 30,
  "environment": {
    "KEY": "value"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Unique function name (alphanumeric, hyphens allowed) |
| runtime | string | Yes | Runtime identifier (nodejs20, nodejs18) |
| handler | string | Yes | Handler function (format: module.function) |
| code | string | Yes | Function source code |
| description | string | No | Human-readable description |
| memory_mb | integer | No | Memory limit (default: 128) |
| timeout_sec | integer | No | Execution timeout (default: 30) |
| environment | object | No | Environment variables |

**Response** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "my-function",
  "runtime": "nodejs20",
  "handler": "index.handler",
  "code": "...",
  "memory_mb": 128,
  "timeout_sec": 30,
  "created_at": "2025-01-19T10:00:00Z",
  "updated_at": "2025-01-19T10:00:00Z"
}
```

---

### List Functions

**GET** `/api/v1/functions`

List all functions.

**Response** `200 OK`
```json
{
  "functions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "my-function",
      "runtime": "nodejs20",
      "handler": "index.handler",
      "memory_mb": 128,
      "created_at": "2025-01-19T10:00:00Z",
      "updated_at": "2025-01-19T10:00:00Z"
    }
  ],
  "count": 1
}
```

---

### Get Function

**GET** `/api/v1/functions/{name}`

Get details of a specific function.

**Parameters**
- `name` - Function name

**Response** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "my-function",
  "description": "My awesome function",
  "runtime": "nodejs20",
  "handler": "index.handler",
  "code": "exports.handler = async (event) => { ... }",
  "memory_mb": 128,
  "timeout_sec": 30,
  "environment": {
    "KEY": "value"
  },
  "created_at": "2025-01-19T10:00:00Z",
  "updated_at": "2025-01-19T10:00:00Z"
}
```

---

### Update Function

**PUT** `/api/v1/functions/{name}`

Update an existing function.

**Parameters**
- `name` - Function name

**Request Body** (all fields optional)
```json
{
  "description": "Updated description",
  "runtime": "nodejs20",
  "handler": "index.newHandler",
  "code": "exports.newHandler = async (event) => { ... }",
  "memory_mb": 256,
  "timeout_sec": 60,
  "environment": {
    "NEW_KEY": "new_value"
  }
}
```

**Response** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "my-function",
  "runtime": "nodejs20",
  "handler": "index.newHandler",
  "updated_at": "2025-01-19T11:00:00Z"
}
```

---

### Delete Function

**DELETE** `/api/v1/functions/{name}`

Delete a function.

**Parameters**
- `name` - Function name

**Response** `200 OK`
```json
{
  "message": "Function deleted successfully",
  "name": "my-function"
}
```

---

### Invoke Function

**POST** `/api/v1/functions/{name}/invoke`

Execute a function and return the result.

**Parameters**
- `name` - Function name

**Query Parameters**
- `local=true` - Execute locally without Firecracker (for development)

**Request Body**
```json
{
  "key1": "value1",
  "key2": "value2"
}
```

The request body is passed to the handler as the `event` parameter.

**Response** `200 OK`
```json
{
  "status_code": 200,
  "body": {
    "message": "Function result"
  },
  "duration_ms": 45,
  "logs": "[INFO] Function executed successfully"
}
```

**Error Response**
```json
{
  "status_code": 500,
  "error": "Error message",
  "duration_ms": 12,
  "logs": "[ERROR] Something went wrong"
}
```

---

## Handler Format

### Node.js Handlers

Functions must export a handler function that follows one of these patterns:

**Async Handler (Recommended)**
```javascript
exports.handler = async (event, context) => {
  // Your code here
  return {
    statusCode: 200,
    body: { message: 'Success' }
  };
};
```

**Callback Handler**
```javascript
exports.handler = (event, context, callback) => {
  // Your code here
  callback(null, {
    statusCode: 200,
    body: { message: 'Success' }
  });
};
```

### Event Object

The `event` object contains the request payload:

```javascript
{
  // Whatever was sent in the invoke request body
  "key1": "value1",
  "key2": "value2"
}
```

### Context Object

The `context` object provides execution context:

```javascript
{
  "functionName": "my-function",
  "functionVersion": "$LATEST",
  "memoryLimitInMB": 128,
  "awsRequestId": "unique-request-id",
  "getRemainingTimeInMillis": () => number,
  "logGroupName": "/impuls/my-function",
  "logStreamName": "2025-01-19/unique-request-id"
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": true,
  "message": "Error description"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Examples

### Create a Hello World Function

```bash
curl -X POST http://localhost:8080/api/v1/functions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "hello-world",
    "runtime": "nodejs20",
    "handler": "index.handler",
    "code": "exports.handler = async (event) => { return { message: \"Hello, \" + (event.name || \"World\") + \"!\" }; }"
  }'
```

### Invoke with Parameters

```bash
curl -X POST http://localhost:8080/api/v1/functions/hello-world/invoke \
  -H "Content-Type: application/json" \
  -d '{"name": "Developer"}'
```

### Create Function with Environment Variables

```bash
curl -X POST http://localhost:8080/api/v1/functions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "secret-function",
    "runtime": "nodejs20",
    "handler": "index.handler",
    "code": "exports.handler = async () => { return { apiUrl: process.env.API_URL }; }",
    "environment": {
      "API_URL": "https://api.example.com",
      "API_KEY": "secret-key"
    }
  }'
```
