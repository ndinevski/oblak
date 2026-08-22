/**
 * Bucket Controller
 * Handles HTTP requests for bucket operations
 */

import type { Core } from "@strapi/strapi";
import { SpomenClientError } from "../services/spomen-client";

import { recordAudit } from "../../../telemetry/audit";
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

interface ActivityLogPayload {
  action: "bucket.create" | "bucket.update" | "bucket.delete";
  userId: number;
  resourceId?: string;
  resourceName?: string;
  status?: "success" | "failure";
  details?: Record<string, unknown>;
  errorMessage?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function getAuthenticatedUser(ctx: Context): { id: number } {
  if (!ctx.state.user) {
    ctx.throw(401, "Authentication required");
  }
  return ctx.state.user;
}

function handleError(ctx: Context, error: unknown): void {
  if (error instanceof SpomenClientError) {
    ctx.status =
      error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 502;
    ctx.body = { error: { message: error.message } };
    return;
  }

  if (error instanceof Error) {
    if (error.message.includes("not found")) {
      ctx.status = 404;
    } else if (error.message.includes("quota")) {
      ctx.status = 403;
    } else if (error.message.includes("already taken")) {
      ctx.status = 409;
    } else {
      ctx.status = 400;
    }
    ctx.body = { error: { message: error.message } };
    return;
  }

  ctx.status = 500;
  ctx.body = { error: { message: "Internal server error" } };
}

async function logBucketActivity(
  strapi: Strapi,
  payload: ActivityLogPayload,
): Promise<void> {
  // Audit records are OpenTelemetry log records now, not Strapi rows, so this
  // is a synchronous fire-and-forget emit with no database round trip.
  recordAudit({
    action: payload.action,
    resourceType: "bucket",
    resourceId: payload.resourceId,
    resourceName: payload.resourceName,
    userId: payload.userId,
    status: payload.status || "success",
    details: payload.details,
    errorMessage: payload.errorMessage,
  });
}

// =============================================================================
// Controller Factory
// =============================================================================

export default ({ strapi }: { strapi: Strapi }) => ({
  // ===========================================================================
  // List Buckets
  // ===========================================================================

  async find(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const bucketService = strapi.service("api::bucket.bucket");

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
    const user = getAuthenticatedUser(ctx);
    const bucketId = parseInt(ctx.params.id, 10);
    try {
      const bucketService = strapi.service("api::bucket.bucket");

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
    const user = getAuthenticatedUser(ctx);
    try {
      const bucketService = strapi.service("api::bucket.bucket");

      const data = ctx.request.body as {
        name: string;
        policy?: "private" | "public-read" | "public-read-write";
        versioning?: boolean;
        tags?: Record<string, string>;
        description?: string;
        quotaBytes?: string;
      };

      // Validate required fields
      if (!data.name) {
        ctx.throw(400, "Bucket name is required");
      }

      // Validate bucket name format
      const nameRegex = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
      if (
        !nameRegex.test(data.name) ||
        data.name.length < 3 ||
        data.name.length > 63
      ) {
        ctx.throw(
          400,
          "Bucket name must be 3-63 characters, lowercase, and can only contain letters, numbers, hyphens, and periods",
        );
      }

      const bucket = await bucketService.create(data, user.id);

      ctx.status = 201;
      ctx.body = { data: bucket };
    } catch (error) {
      await logBucketActivity(strapi, {
        action: "bucket.create",
        userId: user.id,
        resourceName: (ctx.request.body as { name?: string })?.name,
        status: "failure",
        details: {
          name: (ctx.request.body as { name?: string })?.name,
        },
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      handleError(ctx, error);
      return;
    }

    const createdBucket = (
      ctx.body as { data?: { id?: number; name?: string } }
    )?.data;
    await logBucketActivity(strapi, {
      action: "bucket.create",
      userId: user.id,
      resourceId: createdBucket?.id ? String(createdBucket.id) : undefined,
      resourceName: createdBucket?.name,
      details: {
        name: createdBucket?.name,
      },
    });
  },

  // ===========================================================================
  // Update Bucket
  // ===========================================================================

  async update(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    const bucketId = parseInt(ctx.params.id, 10);
    try {
      const bucketService = strapi.service("api::bucket.bucket");

      const data = ctx.request.body as {
        policy?: "private" | "public-read" | "public-read-write";
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
      await logBucketActivity(strapi, {
        action: "bucket.update",
        userId: user.id,
        resourceId: String(bucketId),
        status: "failure",
        details: {
          updatedFields: Object.keys(
            (ctx.request.body || {}) as Record<string, unknown>,
          ),
        },
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      handleError(ctx, error);
      return;
    }

    await logBucketActivity(strapi, {
      action: "bucket.update",
      userId: user.id,
      resourceId: String(bucketId),
      details: {
        updatedFields: Object.keys(
          (ctx.request.body || {}) as Record<string, unknown>,
        ),
      },
    });
  },

  // ===========================================================================
  // Delete Bucket
  // ===========================================================================

  async delete(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    const bucketId = parseInt(ctx.params.id, 10);
    try {
      const force = ctx.query.force === "true";
      const bucketService = strapi.service("api::bucket.bucket");

      const result = await bucketService.delete(bucketId, user.id, force);

      ctx.body = { data: result };
    } catch (error) {
      await logBucketActivity(strapi, {
        action: "bucket.delete",
        userId: user.id,
        resourceId: String(bucketId),
        status: "failure",
        details: {
          force: ctx.query.force === "true",
        },
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      handleError(ctx, error);
      return;
    }

    const deletedData = (ctx.body as { data?: { name?: string } })?.data;
    await logBucketActivity(strapi, {
      action: "bucket.delete",
      userId: user.id,
      resourceId: String(bucketId),
      resourceName: deletedData?.name,
      details: {
        force: ctx.query.force === "true",
      },
    });
  },

  // ===========================================================================
  // Get Bucket Stats
  // ===========================================================================

  async stats(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    const bucketId = parseInt(ctx.params.id, 10);
    try {
      const bucketService = strapi.service("api::bucket.bucket");

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
    const user = getAuthenticatedUser(ctx);
    const bucketId = parseInt(ctx.params.id, 10);
    try {
      const bucketService = strapi.service("api::bucket.bucket");

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
    const user = getAuthenticatedUser(ctx);
    try {
      const bucketService = strapi.service("api::bucket.bucket");

      const quota = await bucketService.getQuotaUsage(user.id);

      ctx.body = { data: quota };
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Issue One-Time S3 Credentials
  // ===========================================================================

  async issueCredentials(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    const bucketId = parseInt(ctx.params.id, 10);

    try {
      const bucketService = strapi.service('api::bucket.bucket');
      const body = (ctx.request.body || {}) as { readWrite?: boolean };

      const credentials = await bucketService.issueBucketCredentials(
        bucketId,
        user.id,
        body.readWrite !== false
      );

      ctx.status = 201;
      ctx.body = { data: credentials };
    } catch (error) {
      handleError(ctx, error);
    }
  },
});
