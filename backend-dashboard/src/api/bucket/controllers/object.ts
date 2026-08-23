/**
 * Object Controller
 * Handles HTTP requests for object/file operations
 */

import type { Core } from "@strapi/strapi";
import { SpomenClientError } from "../services/spomen-client";

import { recordAudit } from "../../../telemetry/audit";
import { requireAccess } from "../../../identitet/authz";

const SERVICE = "storage";
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
    files?: Record<
      string,
      {
        path: string;
        name: string;
        type: string;
        size: number;
      }
    >;
  };
  params: Record<string, string>;
  query: Record<string, unknown>;
  throw: (status: number, message: string) => never;
  body: unknown;
  status: number;
  set: (header: string, value: string) => void;
}

interface ObjectActivityLogPayload {
  action: "object.upload" | "object.delete";
  userId: number;
  bucketId?: number;
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
    } else {
      ctx.status = 400;
    }
    ctx.body = { error: { message: error.message } };
    return;
  }

  ctx.status = 500;
  ctx.body = { error: { message: "Internal server error" } };
}

// Get the object key from wildcard path params
function getObjectKey(ctx: Context): string {
  // Prefer explicit named route params first.
  // Fallback to wildcard params for compatibility with wildcard routes.
  const rawKey =
    ctx.params.objectKey || ctx.params.key || ctx.params["0"] || "";
  if (!rawKey) {
    return "";
  }

  try {
    return decodeURIComponent(rawKey);
  } catch {
    return rawKey;
  }
}

async function logObjectActivity(
  strapi: Strapi,
  payload: ObjectActivityLogPayload,
): Promise<void> {
  // Audit records are OpenTelemetry log records now, not Strapi rows, so this
  // is a synchronous fire-and-forget emit with no database round trip.
  recordAudit({
    action: payload.action,
    resourceType: "object",
    resourceId: payload.bucketId ? String(payload.bucketId) : undefined,
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
  // List Objects
  // ===========================================================================

  async list(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, "read");
    if (!user) return;
    const bucketId = parseInt(ctx.params.id, 10);
    try {
      const objectService = strapi.service("api::bucket.object");

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
    const user = requireAccess(ctx, SERVICE, "read");
    if (!user) return;
    const bucketId = parseInt(ctx.params.id, 10);
    const key = getObjectKey(ctx);
    try {
      const objectService = strapi.service("api::bucket.object");

      if (!key) {
        ctx.throw(400, "Object key is required");
      }

      // Check if info only is requested
      if (ctx.query.info === "true") {
        const info = await objectService.getInfo(bucketId, key, user.id);
        ctx.body = { data: info };
        return;
      }

      // Download the object
      const response = await objectService.download(bucketId, key, user.id);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Stream the response
      ctx.status = 200;
      ctx.set(
        "Content-Type",
        response.headers.get("content-type") || "application/octet-stream",
      );
      ctx.set("Content-Length", String(buffer.length));
      ctx.set("ETag", response.headers.get("etag") || "");
      ctx.body = buffer;
    } catch (error) {
      handleError(ctx, error);
      return;
    }
  },

  // ===========================================================================
  // Upload Object
  // ===========================================================================

  async upload(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, "write");
    if (!user) return;
    const userId = user.id;
    const bucketId = parseInt(ctx.params.id, 10);
    try {
      const objectService = strapi.service("api::bucket.object");

      const body = ctx.request.body as {
        key: string;
        contentType?: string;
        metadata?: Record<string, string>;
      };

      // Check if file upload or base64 data
      const files = ctx.request.files;

      if (files && files.file) {
        // File upload from form. Strapi 5 parses multipart via formidable v3,
        // which exposes filepath/originalFilename/mimetype (not path/name/type),
        // and may hand back an array when the field repeats.
        const fileField = files.file;
        const file = Array.isArray(fileField) ? fileField[0] : fileField;

        if (!file) {
          ctx.throw(
            400,
            'No file provided. Send the file as a "file" field in multipart/form-data.',
          );
        }

        const filePath = file.filepath;
        const fileName = file.originalFilename || file.newFilename;

        if (!filePath) {
          ctx.throw(400, "Uploaded file is missing its temporary path");
        }

        const fs = await import("fs");
        const data = fs.readFileSync(filePath);
        const uploadContentType =
          body.contentType || file.mimetype || "application/octet-stream";

        const result = await objectService.upload(bucketId, user.id, {
          key: body.key || fileName,
          data,
          contentType: uploadContentType,
          contentLength: file.size,
          metadata: {
            ...(body.metadata || {}),
            original_content_type: uploadContentType,
            original_filename: fileName,
          },
        });

        ctx.status = 201;
        ctx.body = { data: result };
      } else if (
        body.key &&
        Object.prototype.hasOwnProperty.call(
          body as Record<string, unknown>,
          "data",
        )
      ) {
        // Base64 encoded data
        const base64Data = (body as Record<string, unknown>).data;
        if (typeof base64Data !== "string") {
          ctx.throw(400, "Data must be a base64 string");
        }
        const buffer = Buffer.from(base64Data, "base64");
        const uploadContentType =
          body.contentType || "application/octet-stream";

        const result = await objectService.upload(bucketId, user.id, {
          key: body.key,
          data: buffer,
          contentType: uploadContentType,
          contentLength: buffer.length,
          metadata: {
            ...(body.metadata || {}),
            original_content_type: uploadContentType,
          },
        });

        ctx.status = 201;
        ctx.body = { data: result };
      } else {
        ctx.throw(400, "No file or data provided");
      }
    } catch (error) {
      if (userId) {
        await logObjectActivity(strapi, {
          action: "object.upload",
          userId,
          bucketId,
          resourceName: (ctx.request.body as { key?: string })?.key,
          status: "failure",
          details: {
            key: (ctx.request.body as { key?: string })?.key,
          },
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        });
      }
      handleError(ctx, error);
      return;
    }

    const uploaded = (
      ctx.body as {
        data?: { key?: string; size?: number; content_type?: string };
      }
    )?.data;
    await logObjectActivity(strapi, {
      action: "object.upload",
      userId: userId!,
      bucketId,
      resourceName: uploaded?.key,
      details: {
        key: uploaded?.key,
        size: uploaded?.size,
        contentType: uploaded?.content_type,
      },
    });
  },

  // ===========================================================================
  // Delete Object
  // ===========================================================================

  async delete(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, "write");
    if (!user) return;
    const userId = user.id;
    const bucketId = parseInt(ctx.params.id, 10);
    const key = getObjectKey(ctx);
    try {
      const objectService = strapi.service("api::bucket.object");

      if (!key) {
        ctx.throw(400, "Object key is required");
      }

      const result = await objectService.delete(bucketId, key, user.id);

      ctx.body = { data: result };
    } catch (error) {
      if (userId) {
        await logObjectActivity(strapi, {
          action: "object.delete",
          userId,
          bucketId,
          resourceName: key,
          status: "failure",
          details: { key },
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        });
      }
      handleError(ctx, error);
      return;
    }

    await logObjectActivity(strapi, {
      action: "object.delete",
      userId: userId!,
      bucketId,
      resourceName: key,
      details: { key },
    });
  },

  // ===========================================================================
  // Delete Multiple Objects
  // ===========================================================================

  async deleteMany(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, "write");
    if (!user) return;
    const userId = user.id;
    const bucketId = parseInt(ctx.params.id, 10);
    try {
      const objectService = strapi.service("api::bucket.object");

      const body = ctx.request.body as { keys: string[] };

      if (!body.keys || !Array.isArray(body.keys) || body.keys.length === 0) {
        ctx.throw(400, "Keys array is required");
      }

      const result = await objectService.deleteMany(
        bucketId,
        body.keys,
        user.id,
      );

      ctx.body = { data: result };
    } catch (error) {
      if (userId) {
        await logObjectActivity(strapi, {
          action: "object.delete",
          userId,
          bucketId,
          status: "failure",
          details: {
            keys: (ctx.request.body as { keys?: string[] })?.keys || [],
          },
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        });
      }
      handleError(ctx, error);
      return;
    }

    const resultData = (
      ctx.body as { data?: { deleted?: string[]; errors?: string[] } }
    )?.data;
    await logObjectActivity(strapi, {
      action: "object.delete",
      userId: userId!,
      bucketId,
      details: {
        deletedCount: resultData?.deleted?.length || 0,
        errorCount: resultData?.errors?.length || 0,
      },
    });
  },

  // ===========================================================================
  // Delete Folder (recursive)
  // ===========================================================================

  async deleteFolder(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, "write");
    if (!user) return;
    const userId = user.id;
    const bucketId = parseInt(ctx.params.id, 10);
    try {
      const objectService = strapi.service("api::bucket.object");

      const body = ctx.request.body as { prefix: string };
      const prefix = body?.prefix?.trim();

      if (!prefix) {
        ctx.throw(400, "Folder prefix is required");
      }

      const result = await objectService.deleteFolder(
        bucketId,
        prefix,
        user.id,
      );
      ctx.body = { data: result };
    } catch (error) {
      if (userId) {
        await logObjectActivity(strapi, {
          action: "object.delete",
          userId,
          bucketId,
          resourceName: (ctx.request.body as { prefix?: string })?.prefix,
          status: "failure",
          details: {
            prefix: (ctx.request.body as { prefix?: string })?.prefix,
          },
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        });
      }
      handleError(ctx, error);
      return;
    }

    await logObjectActivity(strapi, {
      action: "object.delete",
      userId: userId!,
      bucketId,
      resourceName: (ctx.request.body as { prefix?: string })?.prefix,
      details: {
        prefix: (ctx.request.body as { prefix?: string })?.prefix,
      },
    });
  },

  // ===========================================================================
  // Copy Object
  // ===========================================================================

  async copy(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, "write");
    if (!user) return;
    const bucketId = parseInt(ctx.params.id, 10);
    try {
      const objectService = strapi.service("api::bucket.object");

      const body = ctx.request.body as {
        sourceKey: string;
        destKey: string;
        sourceBucket?: string;
        metadata?: Record<string, string>;
      };

      if (!body.sourceKey || !body.destKey) {
        ctx.throw(400, "Source key and destination key are required");
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
    const user = requireAccess(ctx, SERVICE, "read");
    if (!user) return;
    const bucketId = parseInt(ctx.params.id, 10);
    try {
      const objectService = strapi.service("api::bucket.object");

      const body = ctx.request.body as {
        key: string;
        expiresIn?: number;
        method?: "GET" | "PUT";
      };

      if (!body.key) {
        ctx.throw(400, "Object key is required");
      }

      const result = await objectService.getPresignedUrl(bucketId, user.id, {
        key: body.key,
        expires_in: body.expiresIn || 3600,
        method: body.method || "GET",
      });

      ctx.body = { data: result };
    } catch (error) {
      handleError(ctx, error);
    }
  },
});
