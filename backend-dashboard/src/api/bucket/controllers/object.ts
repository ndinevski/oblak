/**
 * Object Controller
 * Handles HTTP requests for object/file operations
 */

import type { Core } from '@strapi/strapi';
import { SpomenClientError } from '../services/spomen-client';

// =============================================================================
// Types
// =============================================================================

interface Context {
  state: {
    user?: { id: number };
  };
  request: {
    body?: unknown;
    query?: Record<string, unknown>;
    files?: Record<string, {
      path: string;
      name: string;
      type: string;
      size: number;
    }>;
  };
  params: Record<string, string>;
  query: Record<string, unknown>;
  throw: (status: number, message: string) => never;
  body: unknown;
  status: number;
  set: (header: string, value: string) => void;
}

// =============================================================================
// Helpers
// =============================================================================

function getAuthenticatedUser(ctx: Context): { id: number } {
  if (!ctx.state.user) {
    ctx.throw(401, 'Authentication required');
  }
  return ctx.state.user;
}

function handleError(ctx: Context, error: unknown): void {
  if (error instanceof SpomenClientError) {
    ctx.status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502;
    ctx.body = { error: { message: error.message } };
    return;
  }

  if (error instanceof Error) {
    if (error.message.includes('not found')) {
      ctx.status = 404;
    } else {
      ctx.status = 400;
    }
    ctx.body = { error: { message: error.message } };
    return;
  }

  ctx.status = 500;
  ctx.body = { error: { message: 'Internal server error' } };
}

// Get the object key from wildcard path params
function getObjectKey(ctx: Context): string {
  // The key might be passed as params[0] for wildcard routes
  return ctx.params['0'] || ctx.params.key || '';
}

// =============================================================================
// Controller Factory
// =============================================================================

export default ({ strapi }: { strapi: Strapi }) => ({
  // ===========================================================================
  // List Objects
  // ===========================================================================

  async list(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const objectService = strapi.service('api::bucket.object');

      const result = await objectService.list(bucketId, user.id, {
        prefix: ctx.query.prefix as string,
        delimiter: ctx.query.delimiter as string,
        marker: ctx.query.marker as string,
        maxKeys: ctx.query.maxKeys ? Number(ctx.query.maxKeys) : undefined,
      });

      ctx.body = { data: result };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Get Object (Info or Download)
  // ===========================================================================

  async get(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const key = getObjectKey(ctx);
      const objectService = strapi.service('api::bucket.object');

      if (!key) {
        ctx.throw(400, 'Object key is required');
      }

      // Check if info only is requested
      if (ctx.query.info === 'true') {
        const info = await objectService.getInfo(bucketId, key, user.id);
        ctx.body = { data: info };
        return;
      }

      // Download the object
      const response = await objectService.download(bucketId, key, user.id);
      
      // Stream the response
      ctx.status = 200;
      ctx.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
      ctx.set('Content-Length', response.headers.get('content-length') || '0');
      ctx.set('ETag', response.headers.get('etag') || '');
      ctx.body = response.body;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Upload Object
  // ===========================================================================

  async upload(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const objectService = strapi.service('api::bucket.object');

      const body = ctx.request.body as {
        key: string;
        contentType?: string;
        metadata?: Record<string, string>;
      };

      // Check if file upload or base64 data
      const files = ctx.request.files;
      
      if (files && files.file) {
        // File upload from form
        const file = files.file;
        const fs = await import('fs');
        const data = fs.readFileSync(file.path);

        const result = await objectService.upload(bucketId, user.id, {
          key: body.key || file.name,
          data,
          contentType: file.type,
          contentLength: file.size,
          metadata: body.metadata,
        });

        ctx.status = 201;
        ctx.body = { data: result };
      } else if (body.key && (body as Record<string, unknown>).data) {
        // Base64 encoded data
        const base64Data = (body as Record<string, unknown>).data as string;
        const buffer = Buffer.from(base64Data, 'base64');

        const result = await objectService.upload(bucketId, user.id, {
          key: body.key,
          data: buffer,
          contentType: body.contentType || 'application/octet-stream',
          contentLength: buffer.length,
          metadata: body.metadata,
        });

        ctx.status = 201;
        ctx.body = { data: result };
      } else {
        ctx.throw(400, 'No file or data provided');
      }
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Delete Object
  // ===========================================================================

  async delete(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const key = getObjectKey(ctx);
      const objectService = strapi.service('api::bucket.object');

      if (!key) {
        ctx.throw(400, 'Object key is required');
      }

      const result = await objectService.delete(bucketId, key, user.id);

      ctx.body = { data: result };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Delete Multiple Objects
  // ===========================================================================

  async deleteMany(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const objectService = strapi.service('api::bucket.object');

      const body = ctx.request.body as { keys: string[] };

      if (!body.keys || !Array.isArray(body.keys) || body.keys.length === 0) {
        ctx.throw(400, 'Keys array is required');
      }

      const result = await objectService.deleteMany(bucketId, body.keys, user.id);

      ctx.body = { data: result };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Copy Object
  // ===========================================================================

  async copy(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const objectService = strapi.service('api::bucket.object');

      const body = ctx.request.body as {
        sourceKey: string;
        destKey: string;
        sourceBucket?: string;
        metadata?: Record<string, string>;
      };

      if (!body.sourceKey || !body.destKey) {
        ctx.throw(400, 'Source key and destination key are required');
      }

      const result = await objectService.copy(bucketId, user.id, {
        sourceKey: body.sourceKey,
        destKey: body.destKey,
        sourceBucket: body.sourceBucket,
        metadata: body.metadata,
      });

      ctx.body = { data: result };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Generate Presigned URL
  // ===========================================================================

  async presignedUrl(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const objectService = strapi.service('api::bucket.object');

      const body = ctx.request.body as {
        key: string;
        expiresIn?: number;
        method?: 'GET' | 'PUT';
      };

      if (!body.key) {
        ctx.throw(400, 'Object key is required');
      }

      const result = await objectService.getPresignedUrl(bucketId, user.id, {
        key: body.key,
        expires_in: body.expiresIn || 3600,
        method: body.method || 'GET',
      });

      ctx.body = { data: result };
    } catch (error) {
      handleError(ctx, error);
    }
  },
});
