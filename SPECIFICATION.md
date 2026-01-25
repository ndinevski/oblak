# Oblak Cloud Dashboard - Technical Specification

> **Version:** 1.0.0  
> **Date:** January 25, 2026  
> **Project:** Private Cloud Management Dashboard

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Backend Specification (Strapi)](#3-backend-specification-strapi)
4. [Frontend Specification (React)](#4-frontend-specification-react)
5. [Service Integration](#5-service-integration)
6. [Data Models](#6-data-models)
7. [API Design](#7-api-design)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [UI/UX Design System](#9-uiux-design-system)
10. [Deployment & Infrastructure](#10-deployment--infrastructure)
11. [Development Roadmap](#11-development-roadmap)

---

## 1. Executive Summary

### 1.1 Project Overview

**Oblak Cloud Dashboard** is a unified management interface for a private cloud infrastructure, providing users with an AWS-like experience for managing cloud resources. The dashboard integrates three core services:

| Service | Purpose | Equivalent |
|---------|---------|------------|
| **Impuls** | Serverless Functions (FaaS) | AWS Lambda |
| **Izvor** | Virtual Machine Provisioning | AWS EC2 |
| **Spomen** | Object Storage | AWS S3 |

### 1.2 Goals

- Provide a single pane of glass for managing all cloud resources
- Enable user self-service for provisioning and managing resources
- Implement multi-tenancy with resource isolation
- Deliver a clean, minimalistic, and intuitive user experience
- Support extensibility for future services

### 1.3 Technology Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Strapi v5 (Headless CMS) |
| **Backend Database** | PostgreSQL 16 |
| **Frontend** | React 18 + TypeScript |
| **UI Components** | shadcn/ui |
| **Styling** | Tailwind CSS |
| **State Management** | TanStack Query (React Query) |
| **Routing** | React Router v6 |
| **Build Tool** | Vite |

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              User's Browser                                   │
│                         (React Dashboard - Port 5173)                        │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Strapi Backend                                      │
│                              (Port 1337)                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  User Management │  │ Resource Tracking│  │ Service Gateway │              │
│  │  (Auth, Roles)   │  │ (Ownership, Logs)│  │ (Proxy/Integrate)│             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                                   │                                           │
│                           PostgreSQL DB                                       │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│      Impuls      │    │      Izvor       │    │      Spomen      │
│   (Port 8080)    │    │   (Port 8082)    │    │   (Port 8081)    │
│  ┌────────────┐  │    │  ┌────────────┐  │    │  ┌────────────┐  │
│  │ Firecracker│  │    │  │  Proxmox   │  │    │  │   MinIO    │  │
│  │   MicroVMs │  │    │  │  Cluster   │  │    │  │  Storage   │  │
│  └────────────┘  │    │  └────────────┘  │    │  └────────────┘  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

### 2.2 Communication Flow

1. **User → Frontend**: User interacts with React dashboard
2. **Frontend → Strapi**: All requests go through Strapi for auth/tracking
3. **Strapi → Services**: Strapi proxies requests to underlying services
4. **Strapi → PostgreSQL**: Persists user data, resource ownership, and audit logs

### 2.3 Directory Structure

```
oblak/
├── backend-dashboard/          # Strapi application
│   ├── config/
│   │   ├── database.ts
│   │   ├── server.ts
│   │   ├── admin.ts
│   │   └── plugins.ts
│   ├── src/
│   │   ├── api/
│   │   │   ├── function/        # Impuls integration
│   │   │   ├── virtual-machine/ # Izvor integration
│   │   │   ├── bucket/          # Spomen integration
│   │   │   ├── object/          # Spomen objects
│   │   │   └── activity-log/    # Audit logging
│   │   ├── components/
│   │   ├── extensions/
│   │   └── middlewares/
│   ├── database/
│   │   └── migrations/
│   ├── public/
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── package.json
│
├── frontend-dashboard/          # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   ├── layout/          # Layout components
│   │   │   ├── dashboard/       # Dashboard widgets
│   │   │   ├── functions/       # Impuls components
│   │   │   ├── vms/             # Izvor components
│   │   │   └── storage/         # Spomen components
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Functions/
│   │   │   ├── VirtualMachines/
│   │   │   ├── Storage/
│   │   │   └── Settings/
│   │   ├── hooks/
│   │   ├── lib/
│   │   │   ├── api/             # API client
│   │   │   └── utils/
│   │   ├── stores/
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── index.html
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
│
├── impuls/                      # Existing service
├── izvor/                       # Existing service
└── spomen/                      # Existing service
```

---

## 3. Backend Specification (Strapi)

### 3.1 Strapi Configuration

#### Database Configuration
```typescript
// config/database.ts
export default ({ env }) => ({
  connection: {
    client: 'postgres',
    connection: {
      host: env('DATABASE_HOST', 'localhost'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME', 'oblak_dashboard'),
      user: env('DATABASE_USERNAME', 'oblak'),
      password: env('DATABASE_PASSWORD', 'oblak'),
      ssl: env.bool('DATABASE_SSL', false),
    },
  },
});
```

#### Environment Variables
```env
# Strapi
HOST=0.0.0.0
PORT=1337
APP_KEYS=<generate-keys>
API_TOKEN_SALT=<generate-salt>
ADMIN_JWT_SECRET=<generate-secret>
JWT_SECRET=<generate-secret>

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=oblak_dashboard
DATABASE_USERNAME=oblak
DATABASE_PASSWORD=oblak

# Service Endpoints
IMPULS_URL=http://localhost:8080
IZVOR_URL=http://localhost:8082
SPOMEN_URL=http://localhost:8081

# Service API Keys (optional)
IMPULS_API_KEY=
IZVOR_API_KEY=
SPOMEN_API_KEY=
```

### 3.2 Content Types (Collections)

#### 3.2.1 Extended User Model

Extends Strapi's built-in `users-permissions` plugin:

```javascript
// src/extensions/users-permissions/content-types/user/schema.json
{
  "kind": "collectionType",
  "collectionName": "up_users",
  "attributes": {
    // Standard Strapi fields (username, email, password, confirmed, blocked, role)
    
    // Extended fields
    "displayName": {
      "type": "string"
    },
    "avatar": {
      "type": "media",
      "allowedTypes": ["images"]
    },
    "organization": {
      "type": "string"
    },
    "quota": {
      "type": "component",
      "component": "user.quota",
      "required": true
    },
    "settings": {
      "type": "json"
    },
    "functions": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::function.function",
      "mappedBy": "owner"
    },
    "virtualMachines": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::virtual-machine.virtual-machine",
      "mappedBy": "owner"
    },
    "buckets": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::bucket.bucket",
      "mappedBy": "owner"
    },
    "activityLogs": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::activity-log.activity-log",
      "mappedBy": "user"
    }
  }
}
```

#### 3.2.2 User Quota Component

```javascript
// src/components/user/quota.json
{
  "collectionName": "components_user_quota",
  "info": {
    "displayName": "Quota",
    "description": "User resource quotas"
  },
  "attributes": {
    "maxFunctions": {
      "type": "integer",
      "default": 10
    },
    "maxVMs": {
      "type": "integer",
      "default": 5
    },
    "maxBuckets": {
      "type": "integer",
      "default": 10
    },
    "maxStorageGB": {
      "type": "integer",
      "default": 50
    },
    "maxVCPUs": {
      "type": "integer",
      "default": 16
    },
    "maxMemoryGB": {
      "type": "integer",
      "default": 32
    }
  }
}
```

#### 3.2.3 Function (Impuls Integration)

```javascript
// src/api/function/content-types/function/schema.json
{
  "kind": "collectionType",
  "collectionName": "functions",
  "info": {
    "singularName": "function",
    "pluralName": "functions",
    "displayName": "Function",
    "description": "Serverless functions managed by Impuls"
  },
  "options": {
    "draftAndPublish": false
  },
  "attributes": {
    "name": {
      "type": "string",
      "required": true,
      "unique": true,
      "regex": "^[a-z0-9-]+$",
      "minLength": 2,
      "maxLength": 63
    },
    "externalId": {
      "type": "string",
      "private": true
    },
    "description": {
      "type": "text"
    },
    "runtime": {
      "type": "enumeration",
      "enum": ["nodejs20", "nodejs18", "python312", "python311", "dotnet8", "dotnet7"],
      "required": true
    },
    "handler": {
      "type": "string",
      "required": true
    },
    "memoryMB": {
      "type": "integer",
      "default": 128,
      "min": 64,
      "max": 3008
    },
    "timeoutSec": {
      "type": "integer",
      "default": 30,
      "min": 1,
      "max": 900
    },
    "environment": {
      "type": "json"
    },
    "status": {
      "type": "enumeration",
      "enum": ["active", "inactive", "error", "deploying"],
      "default": "inactive"
    },
    "lastInvokedAt": {
      "type": "datetime"
    },
    "invocationCount": {
      "type": "biginteger",
      "default": 0
    },
    "owner": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "plugin::users-permissions.user",
      "inversedBy": "functions"
    },
    "tags": {
      "type": "json"
    }
  }
}
```

#### 3.2.4 Virtual Machine (Izvor Integration)

```javascript
// src/api/virtual-machine/content-types/virtual-machine/schema.json
{
  "kind": "collectionType",
  "collectionName": "virtual_machines",
  "info": {
    "singularName": "virtual-machine",
    "pluralName": "virtual-machines",
    "displayName": "Virtual Machine",
    "description": "VMs managed by Izvor"
  },
  "options": {
    "draftAndPublish": false
  },
  "attributes": {
    "name": {
      "type": "string",
      "required": true
    },
    "externalId": {
      "type": "string",
      "private": true
    },
    "description": {
      "type": "text"
    },
    "status": {
      "type": "enumeration",
      "enum": ["running", "stopped", "paused", "starting", "stopping", "creating", "error"],
      "default": "stopped"
    },
    "size": {
      "type": "enumeration",
      "enum": ["nano", "micro", "small", "medium", "large", "xlarge", "xxlarge", "custom"]
    },
    "cores": {
      "type": "integer",
      "required": true
    },
    "memoryMB": {
      "type": "integer",
      "required": true
    },
    "diskGB": {
      "type": "integer",
      "required": true
    },
    "osType": {
      "type": "enumeration",
      "enum": ["linux", "windows", "other"],
      "default": "linux"
    },
    "template": {
      "type": "string"
    },
    "ipAddress": {
      "type": "string"
    },
    "ipv6Address": {
      "type": "string"
    },
    "node": {
      "type": "string"
    },
    "cloudInit": {
      "type": "json"
    },
    "owner": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "plugin::users-permissions.user",
      "inversedBy": "virtualMachines"
    },
    "tags": {
      "type": "json"
    },
    "metadata": {
      "type": "json"
    }
  }
}
```

#### 3.2.5 Bucket (Spomen Integration)

```javascript
// src/api/bucket/content-types/bucket/schema.json
{
  "kind": "collectionType",
  "collectionName": "buckets",
  "info": {
    "singularName": "bucket",
    "pluralName": "buckets",
    "displayName": "Bucket",
    "description": "Storage buckets managed by Spomen"
  },
  "options": {
    "draftAndPublish": false
  },
  "attributes": {
    "name": {
      "type": "string",
      "required": true,
      "unique": true,
      "regex": "^[a-z0-9][a-z0-9.-]*[a-z0-9]$",
      "minLength": 3,
      "maxLength": 63
    },
    "policy": {
      "type": "enumeration",
      "enum": ["private", "public-read", "public-read-write"],
      "default": "private"
    },
    "versioning": {
      "type": "boolean",
      "default": false
    },
    "objectCount": {
      "type": "biginteger",
      "default": 0
    },
    "totalSizeBytes": {
      "type": "biginteger",
      "default": 0
    },
    "owner": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "plugin::users-permissions.user",
      "inversedBy": "buckets"
    },
    "tags": {
      "type": "json"
    }
  }
}
```

#### 3.2.6 Activity Log

```javascript
// src/api/activity-log/content-types/activity-log/schema.json
{
  "kind": "collectionType",
  "collectionName": "activity_logs",
  "info": {
    "singularName": "activity-log",
    "pluralName": "activity-logs",
    "displayName": "Activity Log",
    "description": "User activity and audit trail"
  },
  "options": {
    "draftAndPublish": false
  },
  "attributes": {
    "action": {
      "type": "enumeration",
      "enum": [
        "function.create", "function.update", "function.delete", "function.invoke",
        "vm.create", "vm.start", "vm.stop", "vm.reboot", "vm.delete", "vm.snapshot",
        "bucket.create", "bucket.update", "bucket.delete",
        "object.upload", "object.download", "object.delete",
        "user.login", "user.logout", "user.update"
      ],
      "required": true
    },
    "resourceType": {
      "type": "enumeration",
      "enum": ["function", "virtual-machine", "bucket", "object", "user"],
      "required": true
    },
    "resourceId": {
      "type": "string"
    },
    "resourceName": {
      "type": "string"
    },
    "details": {
      "type": "json"
    },
    "ipAddress": {
      "type": "string"
    },
    "userAgent": {
      "type": "string"
    },
    "status": {
      "type": "enumeration",
      "enum": ["success", "failure", "pending"],
      "default": "success"
    },
    "errorMessage": {
      "type": "text"
    },
    "user": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "plugin::users-permissions.user",
      "inversedBy": "activityLogs"
    }
  }
}
```

### 3.3 Custom Controllers & Services

#### 3.3.1 Function Service (Impuls Integration)

```typescript
// src/api/function/services/function.ts
export default ({ strapi }) => ({
  async createFunction(userId: number, data: CreateFunctionDTO) {
    // 1. Check user quota
    const user = await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      userId,
      { populate: ['quota', 'functions'] }
    );
    
    if (user.functions.length >= user.quota.maxFunctions) {
      throw new ApplicationError('Function quota exceeded');
    }
    
    // 2. Create function in Impuls
    const impulsResponse = await fetch(`${process.env.IMPULS_URL}/api/v1/functions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${user.id}-${data.name}`, // Namespace by user
        runtime: data.runtime,
        handler: data.handler,
        code: data.code,
        memory_mb: data.memoryMB,
        timeout_sec: data.timeoutSec,
        environment: data.environment,
      }),
    });
    
    const impulsFunction = await impulsResponse.json();
    
    // 3. Store reference in Strapi
    const strapiFunction = await strapi.entityService.create('api::function.function', {
      data: {
        name: data.name,
        externalId: impulsFunction.id,
        description: data.description,
        runtime: data.runtime,
        handler: data.handler,
        memoryMB: data.memoryMB || 128,
        timeoutSec: data.timeoutSec || 30,
        environment: data.environment,
        status: 'active',
        owner: userId,
        tags: data.tags,
      },
    });
    
    // 4. Log activity
    await strapi.service('api::activity-log.activity-log').log({
      action: 'function.create',
      resourceType: 'function',
      resourceId: strapiFunction.id,
      resourceName: data.name,
      userId,
    });
    
    return strapiFunction;
  },

  async invokeFunction(userId: number, functionId: number, payload: any) {
    const func = await strapi.entityService.findOne(
      'api::function.function',
      functionId,
      { populate: ['owner'] }
    );
    
    if (func.owner.id !== userId) {
      throw new ForbiddenError('Access denied');
    }
    
    const response = await fetch(
      `${process.env.IMPULS_URL}/api/v1/functions/${func.externalId}/invoke`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    
    // Update invocation stats
    await strapi.entityService.update('api::function.function', functionId, {
      data: {
        lastInvokedAt: new Date(),
        invocationCount: (func.invocationCount || 0) + 1,
      },
    });
    
    return response.json();
  },
});
```

#### 3.3.2 Virtual Machine Service (Izvor Integration)

```typescript
// src/api/virtual-machine/services/virtual-machine.ts
export default ({ strapi }) => ({
  async createVM(userId: number, data: CreateVMDTO) {
    const user = await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      userId,
      { populate: ['quota', 'virtualMachines'] }
    );
    
    // Quota checks
    const currentVMs = user.virtualMachines;
    const totalCores = currentVMs.reduce((sum, vm) => sum + vm.cores, 0);
    const totalMemory = currentVMs.reduce((sum, vm) => sum + vm.memoryMB, 0);
    
    if (currentVMs.length >= user.quota.maxVMs) {
      throw new ApplicationError('VM quota exceeded');
    }
    if (totalCores + data.cores > user.quota.maxVCPUs) {
      throw new ApplicationError('vCPU quota exceeded');
    }
    if (totalMemory + data.memoryMB > user.quota.maxMemoryGB * 1024) {
      throw new ApplicationError('Memory quota exceeded');
    }
    
    // Create VM in Izvor
    const izvorResponse = await fetch(`${process.env.IZVOR_URL}/api/v1/vms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${user.id}-${data.name}`,
        template: data.template,
        size: data.size,
        cores: data.cores,
        memory: data.memoryMB,
        disk_size: data.diskGB,
        cloud_init: data.cloudInit,
        start_on_create: data.startOnCreate,
        tags: [`owner:${user.id}`],
      }),
    });
    
    const izvorVM = await izvorResponse.json();
    
    // Store reference
    const vm = await strapi.entityService.create('api::virtual-machine.virtual-machine', {
      data: {
        name: data.name,
        externalId: izvorVM.id,
        description: data.description,
        status: izvorVM.status,
        size: data.size,
        cores: izvorVM.cores,
        memoryMB: izvorVM.memory,
        diskGB: izvorVM.disk_size,
        osType: izvorVM.os_type,
        template: data.template,
        ipAddress: izvorVM.ip_address,
        node: izvorVM.node,
        owner: userId,
        tags: data.tags,
        metadata: data.metadata,
      },
    });
    
    await strapi.service('api::activity-log.activity-log').log({
      action: 'vm.create',
      resourceType: 'virtual-machine',
      resourceId: vm.id,
      resourceName: data.name,
      userId,
    });
    
    return vm;
  },

  async performAction(userId: number, vmId: number, action: VMAction) {
    const vm = await strapi.entityService.findOne(
      'api::virtual-machine.virtual-machine',
      vmId,
      { populate: ['owner'] }
    );
    
    if (vm.owner.id !== userId) {
      throw new ForbiddenError('Access denied');
    }
    
    await fetch(`${process.env.IZVOR_URL}/api/v1/vms/${vm.externalId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    
    // Update status
    const statusMap = {
      start: 'starting',
      stop: 'stopping',
      shutdown: 'stopping',
      reboot: 'starting',
    };
    
    await strapi.entityService.update('api::virtual-machine.virtual-machine', vmId, {
      data: { status: statusMap[action] || vm.status },
    });
    
    return { success: true };
  },
});
```

#### 3.3.3 Bucket Service (Spomen Integration)

```typescript
// src/api/bucket/services/bucket.ts
export default ({ strapi }) => ({
  async createBucket(userId: number, data: CreateBucketDTO) {
    const user = await strapi.entityService.findOne(
      'plugin::users-permissions.user',
      userId,
      { populate: ['quota', 'buckets'] }
    );
    
    if (user.buckets.length >= user.quota.maxBuckets) {
      throw new ApplicationError('Bucket quota exceeded');
    }
    
    // Create bucket in Spomen
    const bucketName = `user-${user.id}-${data.name}`;
    const spomenResponse = await fetch(`${process.env.SPOMEN_URL}/api/v1/buckets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: bucketName,
        policy: data.policy,
        versioning: data.versioning,
      }),
    });
    
    const spomenBucket = await spomenResponse.json();
    
    const bucket = await strapi.entityService.create('api::bucket.bucket', {
      data: {
        name: data.name,
        policy: data.policy,
        versioning: data.versioning,
        owner: userId,
        tags: data.tags,
      },
    });
    
    await strapi.service('api::activity-log.activity-log').log({
      action: 'bucket.create',
      resourceType: 'bucket',
      resourceId: bucket.id,
      resourceName: data.name,
      userId,
    });
    
    return bucket;
  },

  async listObjects(userId: number, bucketId: number, options: ListObjectsOptions) {
    const bucket = await strapi.entityService.findOne(
      'api::bucket.bucket',
      bucketId,
      { populate: ['owner'] }
    );
    
    if (bucket.owner.id !== userId) {
      throw new ForbiddenError('Access denied');
    }
    
    const bucketName = `user-${userId}-${bucket.name}`;
    const response = await fetch(
      `${process.env.SPOMEN_URL}/api/v1/buckets/${bucketName}/objects?` +
      new URLSearchParams(options)
    );
    
    return response.json();
  },

  async getPresignedUrl(userId: number, bucketId: number, key: string, method: 'GET' | 'PUT') {
    const bucket = await strapi.entityService.findOne(
      'api::bucket.bucket',
      bucketId,
      { populate: ['owner'] }
    );
    
    if (bucket.owner.id !== userId) {
      throw new ForbiddenError('Access denied');
    }
    
    const bucketName = `user-${userId}-${bucket.name}`;
    const response = await fetch(`${process.env.SPOMEN_URL}/api/v1/buckets/${bucketName}/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, method, expires_in: 3600 }),
    });
    
    return response.json();
  },
});
```

### 3.4 Middlewares

#### 3.4.1 Activity Logger Middleware

```typescript
// src/middlewares/activity-logger.ts
export default (config, { strapi }) => {
  return async (ctx, next) => {
    await next();
    
    // Log activity for successful mutations
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(ctx.request.method)) {
      if (ctx.response.status >= 200 && ctx.response.status < 300) {
        const userId = ctx.state?.user?.id;
        if (userId) {
          // Activity logging is handled in services
        }
      }
    }
  };
};
```

#### 3.4.2 Resource Sync Middleware

```typescript
// src/middlewares/resource-sync.ts
// Periodically sync resource status from external services
export default (config, { strapi }) => {
  // Schedule sync every 5 minutes
  setInterval(async () => {
    await syncFunctionStatuses();
    await syncVMStatuses();
    await syncBucketStats();
  }, 5 * 60 * 1000);
};
```

---

## 4. Frontend Specification (React)

### 4.1 Project Setup

```bash
# Create project
npm create vite@latest frontend-dashboard -- --template react-ts

# Install dependencies
npm install @tanstack/react-query axios react-router-dom zustand date-fns
npm install -D tailwindcss postcss autoprefixer
npm install lucide-react class-variance-authority clsx tailwind-merge

# Initialize shadcn/ui
npx shadcn-ui@latest init
```

### 4.2 Tailwind Configuration

```typescript
// tailwind.config.js
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

### 4.3 CSS Variables (Black & White Theme)

```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --card: 0 0% 7%;
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 7%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --ring: 0 0% 83.1%;
  }
}
```

### 4.4 Application Structure

#### 4.4.1 Routing Structure

```typescript
// src/App.tsx
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { path: "/", element: <Dashboard /> },
      
      // Functions (Impuls)
      { path: "/functions", element: <FunctionsList /> },
      { path: "/functions/create", element: <CreateFunction /> },
      { path: "/functions/:id", element: <FunctionDetail /> },
      { path: "/functions/:id/edit", element: <EditFunction /> },
      { path: "/functions/:id/logs", element: <FunctionLogs /> },
      
      // Virtual Machines (Izvor)
      { path: "/vms", element: <VMsList /> },
      { path: "/vms/create", element: <CreateVM /> },
      { path: "/vms/:id", element: <VMDetail /> },
      { path: "/vms/:id/console", element: <VMConsole /> },
      { path: "/vms/:id/snapshots", element: <VMSnapshots /> },
      
      // Storage (Spomen)
      { path: "/storage", element: <BucketsList /> },
      { path: "/storage/create", element: <CreateBucket /> },
      { path: "/storage/:id", element: <BucketDetail /> },
      { path: "/storage/:id/objects/*", element: <ObjectBrowser /> },
      
      // Settings
      { path: "/settings", element: <Settings /> },
      { path: "/settings/profile", element: <Profile /> },
      { path: "/settings/quota", element: <QuotaUsage /> },
      { path: "/settings/activity", element: <ActivityLog /> },
    ],
  },
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { path: "login", element: <Login /> },
      { path: "register", element: <Register /> },
      { path: "forgot-password", element: <ForgotPassword /> },
    ],
  },
]);
```

### 4.5 Core Components

#### 4.5.1 Layout Components

```typescript
// src/components/layout/Sidebar.tsx
interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

const navigation: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Functions", href: "/functions", icon: Zap },
  { title: "Virtual Machines", href: "/vms", icon: Server },
  { title: "Storage", href: "/storage", icon: Database },
];

const settingsNav: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings },
  { title: "Activity", href: "/settings/activity", icon: Activity },
];
```

#### 4.5.2 Dashboard Widgets

```typescript
// src/components/dashboard/ResourceOverview.tsx
interface ResourceCardProps {
  title: string;
  count: number;
  icon: LucideIcon;
  trend?: { value: number; direction: 'up' | 'down' };
  href: string;
}

// src/components/dashboard/QuotaWidget.tsx
interface QuotaProgress {
  resource: string;
  used: number;
  limit: number;
  unit: string;
}

// src/components/dashboard/RecentActivity.tsx
// Shows last 10 activities

// src/components/dashboard/QuickActions.tsx
// Create function, Create VM, Create bucket buttons
```

### 4.6 Feature Components

#### 4.6.1 Functions (Impuls)

```typescript
// Components for serverless functions management

// FunctionsList.tsx - Table with search, filter, sort
// CreateFunction.tsx - Multi-step form
//   - Step 1: Basic info (name, description, runtime)
//   - Step 2: Handler config (handler, memory, timeout)
//   - Step 3: Environment variables
//   - Step 4: Code editor
// FunctionDetail.tsx - Overview, metrics, invoke button
// FunctionCodeEditor.tsx - Monaco editor integration
// FunctionTestPanel.tsx - Test invocation with payload
// FunctionMetrics.tsx - Invocation count, duration charts
```

#### 4.6.2 Virtual Machines (Izvor)

```typescript
// Components for VM management

// VMsList.tsx - Table/Grid view with status indicators
// CreateVM.tsx - Multi-step form
//   - Step 1: Template selection (visual cards)
//   - Step 2: Size selection (predefined or custom)
//   - Step 3: Cloud-init config
//   - Step 4: Network & Tags
// VMDetail.tsx - Overview, metrics, action buttons
// VMActions.tsx - Start, Stop, Reboot, Snapshot dropdown
// VMConsole.tsx - noVNC integration for console access
// VMSnapshots.tsx - List, create, restore snapshots
// VMResourceMonitor.tsx - CPU, Memory, Disk, Network charts
```

#### 4.6.3 Storage (Spomen)

```typescript
// Components for object storage management

// BucketsList.tsx - Card grid with storage stats
// CreateBucket.tsx - Form with policy options
// BucketDetail.tsx - Settings, stats
// ObjectBrowser.tsx - File explorer-like interface
//   - Breadcrumb navigation
//   - Grid/List view toggle
//   - Upload dropzone
//   - Multi-select actions
// ObjectUpload.tsx - Drag & drop with progress
// ObjectPreview.tsx - Preview images, text, JSON
// PresignedUrlGenerator.tsx - Generate shareable links
```

### 4.7 API Client

```typescript
// src/lib/api/client.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:1337/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// src/lib/api/functions.ts
export const functionsApi = {
  list: () => api.get('/functions'),
  get: (id: number) => api.get(`/functions/${id}`),
  create: (data: CreateFunctionInput) => api.post('/functions', { data }),
  update: (id: number, data: UpdateFunctionInput) => api.put(`/functions/${id}`, { data }),
  delete: (id: number) => api.delete(`/functions/${id}`),
  invoke: (id: number, payload: any) => api.post(`/functions/${id}/invoke`, payload),
};

// src/lib/api/vms.ts
export const vmsApi = {
  list: () => api.get('/virtual-machines'),
  get: (id: number) => api.get(`/virtual-machines/${id}`),
  create: (data: CreateVMInput) => api.post('/virtual-machines', { data }),
  delete: (id: number) => api.delete(`/virtual-machines/${id}`),
  action: (id: number, action: VMAction) => api.post(`/virtual-machines/${id}/actions`, { action }),
  getConsole: (id: number) => api.get(`/virtual-machines/${id}/console`),
  listSnapshots: (id: number) => api.get(`/virtual-machines/${id}/snapshots`),
};

// src/lib/api/storage.ts
export const storageApi = {
  listBuckets: () => api.get('/buckets'),
  getBucket: (id: number) => api.get(`/buckets/${id}`),
  createBucket: (data: CreateBucketInput) => api.post('/buckets', { data }),
  updateBucket: (id: number, data: UpdateBucketInput) => api.put(`/buckets/${id}`, { data }),
  deleteBucket: (id: number) => api.delete(`/buckets/${id}`),
  listObjects: (bucketId: number, prefix?: string) => 
    api.get(`/buckets/${bucketId}/objects`, { params: { prefix } }),
  getPresignedUrl: (bucketId: number, key: string, method: 'GET' | 'PUT') =>
    api.post(`/buckets/${bucketId}/presign`, { key, method }),
};
```

### 4.8 React Query Hooks

```typescript
// src/hooks/useFunctions.ts
export function useFunctions() {
  return useQuery({
    queryKey: ['functions'],
    queryFn: () => functionsApi.list().then(res => res.data),
  });
}

export function useFunction(id: number) {
  return useQuery({
    queryKey: ['functions', id],
    queryFn: () => functionsApi.get(id).then(res => res.data),
  });
}

export function useCreateFunction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: functionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['functions'] });
    },
  });
}

export function useInvokeFunction() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      functionsApi.invoke(id, payload).then(res => res.data),
  });
}
```

---

## 5. Service Integration

### 5.1 Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Strapi Backend                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Service Gateway                       │   │
│  │  ┌─────────────┬─────────────┬─────────────┐            │   │
│  │  │   Impuls    │    Izvor    │   Spomen    │            │   │
│  │  │   Client    │   Client    │   Client    │            │   │
│  │  └──────┬──────┴──────┬──────┴──────┬──────┘            │   │
│  │         │             │             │                    │   │
│  └─────────┼─────────────┼─────────────┼────────────────────┘   │
│            │             │             │                         │
└────────────┼─────────────┼─────────────┼─────────────────────────┘
             │             │             │
             ▼             ▼             ▼
      ┌──────────┐   ┌──────────┐   ┌──────────┐
      │  Impuls  │   │  Izvor   │   │  Spomen  │
      │  :8080   │   │  :8082   │   │  :8081   │
      └──────────┘   └──────────┘   └──────────┘
```

### 5.2 Service Client Implementation

```typescript
// src/services/service-client.ts
import { fetch } from 'node-fetch';

interface ServiceConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export class ServiceClient {
  constructor(private config: ServiceConfig) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
      ...options?.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(this.config.timeout || 30000),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ServiceError(response.status, error.message || 'Service error');
    }

    return response.json();
  }

  get<T>(path: string) { return this.request<T>(path, { method: 'GET' }); }
  post<T>(path: string, body: any) { 
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) }); 
  }
  put<T>(path: string, body: any) { 
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) }); 
  }
  delete<T>(path: string) { return this.request<T>(path, { method: 'DELETE' }); }
}
```

### 5.3 Resource Namespacing

To ensure multi-tenancy and resource isolation:

| Service | Resource | Naming Convention |
|---------|----------|-------------------|
| Impuls | Function | `{user_id}-{function_name}` |
| Izvor | VM | `{user_id}-{vm_name}` |
| Spomen | Bucket | `user-{user_id}-{bucket_name}` |

### 5.4 Status Synchronization

```typescript
// src/services/sync.ts
export async function syncResourceStatuses(strapi) {
  // Sync function statuses
  const functions = await strapi.entityService.findMany('api::function.function');
  for (const func of functions) {
    try {
      const status = await impulsClient.get(`/functions/${func.externalId}`);
      await strapi.entityService.update('api::function.function', func.id, {
        data: { status: status.status },
      });
    } catch (e) {
      await strapi.entityService.update('api::function.function', func.id, {
        data: { status: 'error' },
      });
    }
  }

  // Sync VM statuses
  const vms = await strapi.entityService.findMany('api::virtual-machine.virtual-machine');
  for (const vm of vms) {
    try {
      const status = await izvorClient.get(`/vms/${vm.externalId}`);
      await strapi.entityService.update('api::virtual-machine.virtual-machine', vm.id, {
        data: {
          status: status.status,
          ipAddress: status.ip_address,
          cpuUsage: status.cpu_usage,
          memoryUsed: status.memory_used,
        },
      });
    } catch (e) {
      await strapi.entityService.update('api::virtual-machine.virtual-machine', vm.id, {
        data: { status: 'error' },
      });
    }
  }

  // Sync bucket stats
  const buckets = await strapi.entityService.findMany('api::bucket.bucket');
  for (const bucket of buckets) {
    try {
      const owner = await strapi.entityService.findOne(
        'plugin::users-permissions.user',
        bucket.owner
      );
      const bucketName = `user-${owner.id}-${bucket.name}`;
      const stats = await spomenClient.get(`/buckets/${bucketName}`);
      await strapi.entityService.update('api::bucket.bucket', bucket.id, {
        data: {
          objectCount: stats.object_count,
          totalSizeBytes: stats.total_size,
        },
      });
    } catch (e) {
      // Bucket may not exist in Spomen
    }
  }
}
```

---

## 6. Data Models

### 6.1 Entity Relationship Diagram

```
┌─────────────────────┐
│        User         │
├─────────────────────┤
│ id                  │
│ username            │
│ email               │
│ password            │
│ displayName         │
│ organization        │
│ role                │
│ quota (component)   │
├─────────────────────┤
│ ┌─ functions[]      │
│ ├─ virtualMachines[]│
│ ├─ buckets[]        │
│ └─ activityLogs[]   │
└──────────┬──────────┘
           │
     ┌─────┴─────┬────────────┬───────────────┐
     │           │            │               │
     ▼           ▼            ▼               ▼
┌─────────┐ ┌─────────┐ ┌─────────┐    ┌───────────┐
│Function │ │   VM    │ │ Bucket  │    │ActivityLog│
├─────────┤ ├─────────┤ ├─────────┤    ├───────────┤
│id       │ │id       │ │id       │    │id         │
│name     │ │name     │ │name     │    │action     │
│externalId│ │externalId│ │policy   │    │resourceType│
│runtime  │ │status   │ │versioning│   │resourceId │
│handler  │ │size     │ │objectCount│  │details    │
│memoryMB │ │cores    │ │totalSize │   │status     │
│timeoutSec│ │memoryMB │ │owner*   │    │user*      │
│status   │ │diskGB   │ │tags     │    │createdAt  │
│owner*   │ │ipAddress│ └─────────┘    └───────────┘
│tags     │ │template │
└─────────┘ │owner*   │
            │tags     │
            └─────────┘
```

### 6.2 TypeScript Types

```typescript
// src/types/models.ts

// User & Auth
interface User {
  id: number;
  username: string;
  email: string;
  displayName?: string;
  organization?: string;
  avatar?: Media;
  quota: Quota;
  createdAt: string;
  updatedAt: string;
}

interface Quota {
  maxFunctions: number;
  maxVMs: number;
  maxBuckets: number;
  maxStorageGB: number;
  maxVCPUs: number;
  maxMemoryGB: number;
}

// Functions
type FunctionRuntime = 'nodejs20' | 'nodejs18' | 'python312' | 'python311' | 'dotnet8' | 'dotnet7';
type FunctionStatus = 'active' | 'inactive' | 'error' | 'deploying';

interface Function {
  id: number;
  name: string;
  description?: string;
  runtime: FunctionRuntime;
  handler: string;
  memoryMB: number;
  timeoutSec: number;
  environment?: Record<string, string>;
  status: FunctionStatus;
  lastInvokedAt?: string;
  invocationCount: number;
  owner: User;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

// Virtual Machines
type VMStatus = 'running' | 'stopped' | 'paused' | 'starting' | 'stopping' | 'creating' | 'error';
type VMSize = 'nano' | 'micro' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge' | 'custom';
type OSType = 'linux' | 'windows' | 'other';

interface VirtualMachine {
  id: number;
  name: string;
  description?: string;
  status: VMStatus;
  size: VMSize;
  cores: number;
  memoryMB: number;
  diskGB: number;
  osType: OSType;
  template?: string;
  ipAddress?: string;
  ipv6Address?: string;
  node?: string;
  owner: User;
  tags?: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface VMTemplate {
  id: string;
  name: string;
  description?: string;
  osType: OSType;
  diskSize: number;
}

// Storage
type BucketPolicy = 'private' | 'public-read' | 'public-read-write';

interface Bucket {
  id: number;
  name: string;
  policy: BucketPolicy;
  versioning: boolean;
  objectCount: number;
  totalSizeBytes: number;
  owner: User;
  tags?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

interface StorageObject {
  key: string;
  size: number;
  contentType: string;
  etag: string;
  lastModified: string;
  metadata?: Record<string, string>;
  versionId?: string;
}

// Activity Log
type ActivityAction =
  | 'function.create' | 'function.update' | 'function.delete' | 'function.invoke'
  | 'vm.create' | 'vm.start' | 'vm.stop' | 'vm.reboot' | 'vm.delete' | 'vm.snapshot'
  | 'bucket.create' | 'bucket.update' | 'bucket.delete'
  | 'object.upload' | 'object.download' | 'object.delete'
  | 'user.login' | 'user.logout' | 'user.update';

interface ActivityLog {
  id: number;
  action: ActivityAction;
  resourceType: 'function' | 'virtual-machine' | 'bucket' | 'object' | 'user';
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, any>;
  status: 'success' | 'failure' | 'pending';
  errorMessage?: string;
  ipAddress?: string;
  user: User;
  createdAt: string;
}
```

---

## 7. API Design

### 7.1 Strapi REST API Endpoints

All endpoints are prefixed with `/api`.

#### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/local` | Login with email/password |
| POST | `/auth/local/register` | Register new user |
| GET | `/users/me` | Get current user |
| PUT | `/users/me` | Update current user |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password |

#### Functions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/functions` | List user's functions |
| GET | `/functions/:id` | Get function details |
| POST | `/functions` | Create function |
| PUT | `/functions/:id` | Update function |
| DELETE | `/functions/:id` | Delete function |
| POST | `/functions/:id/invoke` | Invoke function |
| GET | `/functions/:id/logs` | Get invocation logs |

#### Virtual Machines

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/virtual-machines` | List user's VMs |
| GET | `/virtual-machines/:id` | Get VM details |
| POST | `/virtual-machines` | Create VM |
| DELETE | `/virtual-machines/:id` | Delete VM |
| POST | `/virtual-machines/:id/actions` | Perform action (start/stop/reboot) |
| GET | `/virtual-machines/:id/console` | Get console URL |
| GET | `/virtual-machines/:id/snapshots` | List snapshots |
| POST | `/virtual-machines/:id/snapshots` | Create snapshot |
| GET | `/templates` | List available templates |
| GET | `/sizes` | List available sizes |

#### Storage

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/buckets` | List user's buckets |
| GET | `/buckets/:id` | Get bucket details |
| POST | `/buckets` | Create bucket |
| PUT | `/buckets/:id` | Update bucket |
| DELETE | `/buckets/:id` | Delete bucket |
| GET | `/buckets/:id/objects` | List objects |
| POST | `/buckets/:id/presign` | Get presigned URL |
| DELETE | `/buckets/:id/objects/:key` | Delete object |

#### Activity & Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/activity-logs` | List user's activity |
| GET | `/quota` | Get quota usage |

### 7.2 Response Format

```typescript
// Success response
{
  "data": T | T[],
  "meta": {
    "pagination"?: {
      "page": number,
      "pageSize": number,
      "pageCount": number,
      "total": number
    }
  }
}

// Error response
{
  "error": {
    "status": number,
    "name": string,
    "message": string,
    "details"?: any
  }
}
```

---

## 8. Authentication & Authorization

### 8.1 Authentication Flow

```
┌───────────┐      ┌───────────┐      ┌───────────┐
│  Frontend │      │  Strapi   │      │ PostgreSQL│
└─────┬─────┘      └─────┬─────┘      └─────┬─────┘
      │                   │                   │
      │ POST /auth/local  │                   │
      │ {email, password} │                   │
      │──────────────────>│                   │
      │                   │ Verify credentials│
      │                   │──────────────────>│
      │                   │<──────────────────│
      │                   │                   │
      │  {jwt, user}      │                   │
      │<──────────────────│                   │
      │                   │                   │
      │ Store JWT locally │                   │
      │                   │                   │
      │ GET /functions    │                   │
      │ Authorization:    │                   │
      │ Bearer <jwt>      │                   │
      │──────────────────>│                   │
      │                   │ Validate JWT      │
      │                   │ Get user          │
      │                   │──────────────────>│
      │                   │<──────────────────│
      │                   │                   │
      │  {data: [...]}    │                   │
      │<──────────────────│                   │
```

### 8.2 Authorization Rules

#### Role-Based Access Control

| Role | Description | Permissions |
|------|-------------|-------------|
| **Authenticated** | Standard user | CRUD own resources |
| **Admin** | Administrator | Full access + user management |

#### Resource Ownership

All resources (functions, VMs, buckets) are scoped to their owner:

```typescript
// Strapi policy: is-owner.ts
export default async (policyContext, config, { strapi }) => {
  const { user } = policyContext.state;
  const { id } = policyContext.params;
  
  const entity = await strapi.entityService.findOne(
    policyContext.path.split('/')[2], // e.g., 'api::function.function'
    id,
    { populate: ['owner'] }
  );
  
  if (!entity || entity.owner.id !== user.id) {
    return false;
  }
  
  return true;
};
```

### 8.3 Security Measures

1. **JWT Configuration**
   - Short-lived tokens (1 hour)
   - Refresh token rotation
   - HttpOnly cookies for refresh tokens

2. **Rate Limiting**
   - 100 requests/minute per user
   - 10 login attempts/minute per IP

3. **Input Validation**
   - Strapi built-in validation
   - Custom validators for resource names

4. **Service Communication**
   - Internal API keys between Strapi and services
   - Request signing for sensitive operations

---

## 9. UI/UX Design System

### 9.1 Design Principles

1. **Minimalism**: Clean interfaces with essential information only
2. **Consistency**: Unified patterns across all sections
3. **Clarity**: Clear visual hierarchy and feedback
4. **Efficiency**: Minimal clicks to accomplish tasks
5. **Responsiveness**: Works on desktop and tablet

### 9.2 Color System

```css
/* Primary Palette - Monochromatic */
:root {
  /* Backgrounds */
  --bg-primary: #FFFFFF;      /* Main background */
  --bg-secondary: #F8F9FA;    /* Secondary background */
  --bg-tertiary: #F1F3F5;     /* Cards, inputs */
  
  /* Foregrounds */
  --fg-primary: #0A0A0A;      /* Primary text */
  --fg-secondary: #4A4A4A;    /* Secondary text */
  --fg-muted: #8A8A8A;        /* Muted text */
  
  /* Borders */
  --border-default: #E5E7EB;
  --border-strong: #D1D5DB;
  
  /* Interactive */
  --interactive-default: #0A0A0A;
  --interactive-hover: #333333;
  
  /* Status Colors */
  --status-success: #10B981;  /* Green for running/active */
  --status-warning: #F59E0B;  /* Amber for pending */
  --status-error: #EF4444;    /* Red for errors */
  --status-info: #3B82F6;     /* Blue for info */
}

/* Dark Mode */
.dark {
  --bg-primary: #0A0A0A;
  --bg-secondary: #141414;
  --bg-tertiary: #1F1F1F;
  
  --fg-primary: #FAFAFA;
  --fg-secondary: #A1A1A1;
  --fg-muted: #6B6B6B;
  
  --border-default: #262626;
  --border-strong: #404040;
  
  --interactive-default: #FAFAFA;
  --interactive-hover: #D4D4D4;
}
```

### 9.3 Typography

```css
/* Font Stack */
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "JetBrains Mono", "Fira Code", monospace;

/* Type Scale */
--text-xs: 0.75rem;     /* 12px */
--text-sm: 0.875rem;    /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg: 1.125rem;    /* 18px */
--text-xl: 1.25rem;     /* 20px */
--text-2xl: 1.5rem;     /* 24px */
--text-3xl: 1.875rem;   /* 30px */
--text-4xl: 2.25rem;    /* 36px */
```

### 9.4 Component Guidelines

#### Buttons

| Variant | Usage |
|---------|-------|
| Primary (solid black) | Main actions: Create, Save |
| Secondary (outline) | Alternative actions: Cancel, Back |
| Ghost (text only) | Tertiary actions |
| Destructive (red) | Delete, Remove |

#### Cards

```
┌─────────────────────────────────────┐
│ [Icon] Title               [Badge] │
├─────────────────────────────────────┤
│                                     │
│  Main content area                  │
│                                     │
├─────────────────────────────────────┤
│ [Secondary action]    [Primary btn] │
└─────────────────────────────────────┘
```

#### Data Tables

- Zebra striping for readability
- Sticky header on scroll
- Row actions in dropdown menu
- Bulk selection support
- Sortable columns
- Search and filter controls

#### Status Indicators

| Status | Visual |
|--------|--------|
| Running/Active | Green dot + text |
| Stopped/Inactive | Gray dot + text |
| Starting/Pending | Amber pulsing dot |
| Error | Red dot + text |

### 9.5 Page Layouts

#### Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  Logo   [Search]                          [Notifications] [U]│
├──────┬───────────────────────────────────────────────────────┤
│      │                                                       │
│ Nav  │   Welcome, {name}                                     │
│      │                                                       │
│ ○ D  │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│ ○ F  │   │Functions│ │   VMs   │ │ Storage │ │  Usage  │    │
│ ○ VM │   │    5    │ │    3    │ │  10 GB  │ │   45%   │    │
│ ○ S  │   └─────────┘ └─────────┘ └─────────┘ └─────────┘    │
│      │                                                       │
│──────│   Recent Activity                    Quick Actions    │
│      │   ┌──────────────────────┐          ┌───────────┐    │
│ ○ Set│   │ ▪ Created function   │          │ + Function│    │
│ ○ Act│   │ ▪ Started VM-1       │          │ + VM      │    │
│      │   │ ▪ Uploaded file.png  │          │ + Bucket  │    │
│      │   └──────────────────────┘          └───────────┘    │
└──────┴───────────────────────────────────────────────────────┘
```

#### Resource List

```
┌──────────────────────────────────────────────────────────────┐
│  Functions                                       [+ Create]  │
├──────────────────────────────────────────────────────────────┤
│  [Search...] [Runtime ▼] [Status ▼]                         │
├──────────────────────────────────────────────────────────────┤
│  □  Name            Runtime    Memory   Status    Actions    │
├──────────────────────────────────────────────────────────────┤
│  □  hello-world     Node.js    128 MB   ● Active   [···]    │
│  □  process-data    Python     256 MB   ● Active   [···]    │
│  □  api-handler     Node.js    512 MB   ○ Inactive [···]    │
├──────────────────────────────────────────────────────────────┤
│  Showing 1-3 of 3                           [<] 1 [>]        │
└──────────────────────────────────────────────────────────────┘
```

#### Resource Detail

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back    hello-world                  [Edit] [▼ Actions]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────┬────────────────────┐   │
│  │ Overview                        │ Quick Stats        │   │
│  │                                 │                    │   │
│  │ Status:     ● Active           │ Invocations: 1,234│   │
│  │ Runtime:    nodejs20           │ Avg Duration: 45ms│   │
│  │ Memory:     128 MB             │ Errors: 2 (0.1%)  │   │
│  │ Timeout:    30s                │                    │   │
│  │ Handler:    index.handler      │                    │   │
│  └─────────────────────────────────┴────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Test Invoke                                         │    │
│  │ ┌─────────────────────────────────────────────────┐ │    │
│  │ │ { "name": "world" }                             │ │    │
│  │ └─────────────────────────────────────────────────┘ │    │
│  │                                           [Invoke]  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. Deployment & Infrastructure

### 10.1 Containerization Strategy

All components are fully containerized using Docker for consistent development, testing, and production environments.

#### Backend Dockerfile (Strapi)

```dockerfile
# backend-dashboard/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build

# Runner
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 strapi

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public

USER strapi
EXPOSE 1337
CMD ["npm", "run", "start"]
```

#### Frontend Dockerfile (React + Nginx)

```dockerfile
# frontend-dashboard/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Frontend Nginx Configuration

```nginx
# frontend-dashboard/nginx.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA routing - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health check endpoint
    location /health {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
```

### 10.2 Docker Compose Setup

```yaml
# docker-compose.yml (root level)
version: '3.8'

services:
  # Dashboard PostgreSQL
  dashboard-db:
    image: postgres:16-alpine
    container_name: oblak-dashboard-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: oblak_dashboard
      POSTGRES_USER: oblak
      POSTGRES_PASSWORD: oblak_secret
    volumes:
      - dashboard_db_data:/var/lib/postgresql/data
    networks:
      - oblak_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U oblak -d oblak_dashboard"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Strapi Backend
  backend-dashboard:
    build:
      context: ./backend-dashboard
      dockerfile: Dockerfile
    container_name: oblak-backend
    restart: unless-stopped
    ports:
      - "1337:1337"
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: 1337
      DATABASE_CLIENT: postgres
      DATABASE_HOST: dashboard-db
      DATABASE_PORT: 5432
      DATABASE_NAME: oblak_dashboard
      DATABASE_USERNAME: oblak
      DATABASE_PASSWORD: oblak_secret
      DATABASE_SSL: "false"
      IMPULS_URL: http://impuls:8080
      IZVOR_URL: http://izvor:8082
      SPOMEN_URL: http://spomen:8081
      APP_KEYS: ${APP_KEYS}
      API_TOKEN_SALT: ${API_TOKEN_SALT}
      ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET}
      JWT_SECRET: ${JWT_SECRET}
      TRANSFER_TOKEN_SALT: ${TRANSFER_TOKEN_SALT}
    depends_on:
      dashboard-db:
        condition: service_healthy
    networks:
      - oblak_network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:1337/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # React Frontend
  frontend-dashboard:
    build:
      context: ./frontend-dashboard
      dockerfile: Dockerfile
      args:
        VITE_API_URL: http://localhost:1337/api
    container_name: oblak-frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - backend-dashboard
    networks:
      - oblak_network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:80/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Include existing services
  impuls:
    extends:
      file: ./impuls/docker-compose.yml
      service: impuls
    networks:
      - oblak_network

  izvor:
    extends:
      file: ./izvor/docker-compose.yml
      service: izvor
    networks:
      - oblak_network

  spomen:
    extends:
      file: ./spomen/docker-compose.yml
      service: spomen
    networks:
      - oblak_network

networks:
  oblak_network:
    driver: bridge
    name: oblak_network

volumes:
  dashboard_db_data:
    name: oblak_dashboard_db_data
```

### 10.3 Development Docker Compose Override

```yaml
# docker-compose.override.yml (for development)
version: '3.8'

services:
  backend-dashboard:
    build:
      context: ./backend-dashboard
      dockerfile: Dockerfile.dev
    volumes:
      - ./backend-dashboard:/app
      - /app/node_modules
    environment:
      NODE_ENV: development
    command: npm run develop

  frontend-dashboard:
    build:
      context: ./frontend-dashboard
      dockerfile: Dockerfile.dev
    volumes:
      - ./frontend-dashboard:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:1337/api
    command: npm run dev -- --host
```

### 10.4 Development Dockerfiles

```dockerfile
# backend-dashboard/Dockerfile.dev
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm install
COPY . .
EXPOSE 1337
CMD ["npm", "run", "develop"]
```

```dockerfile
# frontend-dashboard/Dockerfile.dev
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
```

### 10.5 Makefile

```makefile
# Makefile (root level)
.PHONY: help dev build start stop restart logs clean test

help:
	@echo "Oblak Cloud Dashboard - Available commands:"
	@echo "  make dev      - Start development environment with hot-reload"
	@echo "  make build    - Build all Docker images"
	@echo "  make start    - Start production containers"
	@echo "  make stop     - Stop all containers"
	@echo "  make restart  - Restart all containers"
	@echo "  make logs     - View container logs"
	@echo "  make clean    - Remove containers and volumes"
	@echo "  make test     - Run all tests"

dev:
	docker compose -f docker-compose.yml -f docker-compose.override.yml up --build

build:
	docker compose build

start:
	docker compose up -d

stop:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

clean:
	docker compose down -v --remove-orphans
	docker system prune -f

test:
	docker compose exec backend-dashboard npm test
	docker compose exec frontend-dashboard npm test

test-backend:
	docker compose exec backend-dashboard npm test

test-frontend:
	docker compose exec frontend-dashboard npm test

shell-backend:
	docker compose exec backend-dashboard sh

shell-frontend:
	docker compose exec frontend-dashboard sh

db-shell:
	docker compose exec dashboard-db psql -U oblak -d oblak_dashboard
```

### 10.2 Environment Configuration

```bash
# .env.example
# Strapi
NODE_ENV=development
HOST=0.0.0.0
PORT=1337
APP_KEYS=toGenerate
API_TOKEN_SALT=toGenerate
ADMIN_JWT_SECRET=toGenerate
JWT_SECRET=toGenerate
TRANSFER_TOKEN_SALT=toGenerate

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=oblak_dashboard
DATABASE_USERNAME=oblak
DATABASE_PASSWORD=oblak_secret
DATABASE_SSL=false

# Services
IMPULS_URL=http://localhost:8080
IZVOR_URL=http://localhost:8082
SPOMEN_URL=http://localhost:8081

# Frontend
VITE_API_URL=http://localhost:1337/api
```

### 10.3 Production Considerations

1. **SSL/TLS**: Use nginx reverse proxy with Let's Encrypt
2. **Database**: Use managed PostgreSQL (RDS, Cloud SQL, etc.)
3. **Secrets**: Use environment variables or secrets manager
4. **Monitoring**: Prometheus + Grafana for metrics
5. **Logging**: Centralized logging with ELK or similar
6. **Backups**: Automated PostgreSQL backups

---

## 11. Development Roadmap

### Phase 1: Foundation (Week 1-2)

- [ ] Set up Strapi project with PostgreSQL
- [ ] Configure user authentication
- [ ] Create base content types
- [ ] Set up React project with Vite
- [ ] Configure Tailwind and shadcn/ui
- [ ] Implement layout components
- [ ] Create authentication pages

### Phase 2: Core Features (Week 3-4)

- [ ] Implement Functions module (Impuls integration)
  - [ ] List/Create/Edit/Delete
  - [ ] Code editor
  - [ ] Test invocation
- [ ] Implement VMs module (Izvor integration)
  - [ ] List/Create/Delete
  - [ ] Actions (start/stop/reboot)
  - [ ] Console access
- [ ] Implement Storage module (Spomen integration)
  - [ ] Bucket management
  - [ ] Object browser
  - [ ] Upload/Download

### Phase 3: Polish & Features (Week 5-6)

- [ ] Dashboard with widgets
- [ ] Activity logging
- [ ] Quota management
- [ ] Search and filtering
- [ ] Responsive design
- [ ] Dark mode

### Phase 4: Testing & Deployment (Week 7-8)

- [ ] Unit tests for services
- [ ] Integration tests
- [ ] E2E tests with Playwright
- [ ] Docker setup
- [ ] Documentation
- [ ] Production deployment

---

## Appendix A: shadcn/ui Components Required

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add label
npx shadcn-ui@latest add select
npx shadcn-ui@latest add textarea
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add table
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add skeleton
npx shadcn-ui@latest add progress
npx shadcn-ui@latest add switch
npx shadcn-ui@latest add checkbox
npx shadcn-ui@latest add separator
npx shadcn-ui@latest add sheet
npx shadcn-ui@latest add command
npx shadcn-ui@latest add form
npx shadcn-ui@latest add alert
npx shadcn-ui@latest add popover
npx shadcn-ui@latest add tooltip
```

---

## Appendix B: NPM Dependencies

### Backend (Strapi)

```json
{
  "dependencies": {
    "@strapi/strapi": "^5.0.0",
    "@strapi/plugin-users-permissions": "^5.0.0",
    "pg": "^8.11.0",
    "node-fetch": "^3.3.0"
  }
}
```

### Frontend (React)

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "@tanstack/react-query": "^5.0.0",
    "axios": "^1.6.0",
    "zustand": "^4.4.0",
    "date-fns": "^3.0.0",
    "lucide-react": "^0.300.0",
    "@radix-ui/react-*": "latest",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "@monaco-editor/react": "^4.6.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.2.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}
```

---

*Document prepared for Oblak Cloud Dashboard project. Ready for implementation.*
