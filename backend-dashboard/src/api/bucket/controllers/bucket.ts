/**
 * Bucket Controller
 * Handles HTTP requests for bucket operations
 */

import { Strapi } from '@strapi/strapi';
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
  };
  params: Record<string, string>;
  query: Record<string, unknown>;
  throw: (status: number, message: string) => never;
  body: unknown;
  status: number;
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
    } else if (error.message.includes('quota')) {
      ctx.status = 403;
    } else if (error.message.includes('already taken')) {
      ctx.status = 409;
    } else {
      ctx.status = 400;
    }
    ctx.body = { error: { message: error.message } };
    return;
  }

  ctx.status = 500;
  ctx.body = { error: { message: 'Internal server error' } };
}

// =============================================================================
// Controller Factory
// =============================================================================

export default ({ strapi }: { strapi: Strapi }) => ({
  // ===========================================================================
  // List Buckets
  // ===========================================================================

  async find(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketService = strapi.service('api::bucket.bucket');

      const result = await bucketService.find(user.id, {
        pagination: {
          page: Number(ctx.query.page) || 1,
          pageSize: Number(ctx.query.pageSize) || 25,
        },
        sort: ctx.query.sort,
        filters: ctx.query.filters,
      });

      ctx.body = result;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Get Single Bucket
  // ===========================================================================

  async findOne(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const bucketService = strapi.service('api::bucket.bucket');

      const bucket = await bucketService.findOne(bucketId, user.id);

      ctx.body = { data: bucket };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Create Bucket
  // ===========================================================================

  async create(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketService = strapi.service('api::bucket.bucket');

      const data = ctx.request.body as {
        name: string;
        policy?: 'private' | 'public-read' | 'public-read-write';
        versioning?: boolean;
        tags?: Record<string, string>;
        description?: string;
        quotaBytes?: string;
      };

      // Validate required fields
      if (!data.name) {
        ctx.throw(400, 'Bucket name is required');
      }

      // Validate bucket name format
      const nameRegex = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
      if (!nameRegex.test(data.name) || data.name.length < 3 || data.name.length > 63) {
        ctx.throw(
          400,
          'Bucket name must be 3-63 characters, lowercase, and can only contain letters, numbers, hyphens, and periods'
        );
      }

      const bucket = await bucketService.create(data, user.id);

      ctx.status = 201;
      ctx.body = { data: bucket };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Update Bucket
  // ===========================================================================

  async update(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const bucketService = strapi.service('api::bucket.bucket');

      const data = ctx.request.body as {
        policy?: 'private' | 'public-read' | 'public-read-write';
        versioning?: boolean;
        tags?: Record<string, string>;
        description?: string;
        corsConfiguration?: unknown;
        lifecycleRules?: unknown;
        quotaBytes?: string;
      };

      const bucket = await bucketService.update(bucketId, data, user.id);

      ctx.body = { data: bucket };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Delete Bucket
  // ===========================================================================

  async delete(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const force = ctx.query.force === 'true';
      const bucketService = strapi.service('api::bucket.bucket');

      const result = await bucketService.delete(bucketId, user.id, force);

      ctx.body = { data: result };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Get Bucket Stats
  // ===========================================================================

  async stats(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const bucketService = strapi.service('api::bucket.bucket');

      const stats = await bucketService.getStats(bucketId, user.id);

      ctx.body = { data: stats };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Sync Bucket
  // ===========================================================================

  async sync(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketId = parseInt(ctx.params.id, 10);
      const bucketService = strapi.service('api::bucket.bucket');

      const bucket = await bucketService.sync(bucketId, user.id);

      ctx.body = { data: bucket };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Get Quota Usage
  // ===========================================================================

  async quota(ctx: Context) {
    try {
      const user = getAuthenticatedUser(ctx);
      const bucketService = strapi.service('api::bucket.bucket');

      const quota = await bucketService.getQuotaUsage(user.id);

      ctx.body = { data: quota };
    } catch (error) {
      handleError(ctx, error);
    }
  },
});
