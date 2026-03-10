/**
 * Object Service
 * Business logic for object/file operations with Spomen integration
 */

import {
  createSpomenClient,
  SpomenClient,
  SpomenClientError,
  type SpomenObject,
  type SpomenObjectList,
  type SpomenCopyObjectRequest,
  type SpomenPresignedURLRequest,
  type SpomenPresignedURLResponse,
} from './spomen-client';

// =============================================================================
// Types
// =============================================================================

interface ListObjectsParams {
  prefix?: string;
  delimiter?: string;
  marker?: string;
  maxKeys?: number;
}

interface UploadObjectParams {
  key: string;
  data: Buffer | ReadableStream;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

interface CopyObjectParams {
  sourceKey: string;
  destKey: string;
  sourceBucket?: string;
  metadata?: Record<string, string>;
}

interface DeleteFolderResult {
  deleted: string[];
  errors: string[];
}

const extensionContentTypes: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
};

function inferContentTypeFromKey(key: string): string {
  const lastDot = key.lastIndexOf('.');
  if (lastDot === -1) {
    return '';
  }

  const ext = key.slice(lastDot + 1).toLowerCase();
  return extensionContentTypes[ext] || '';
}

function normalizeObjectContentType(
  object: SpomenObject,
  explicitFallback?: string
): SpomenObject {
  const metadataType = object.metadata?.original_content_type || object.metadata?.content_type;
  const inferredType = inferContentTypeFromKey(object.key);

  return {
    ...object,
    content_type:
      object.content_type ||
      metadataType ||
      explicitFallback ||
      inferredType ||
      'application/octet-stream',
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function getSpomenClient(): SpomenClient {
  const baseUrl = process.env.SPOMEN_URL || 'http://localhost:8083';
  return createSpomenClient({ baseUrl });
}

async function getBucketByIdOrThrow(
  strapi: Strapi.Strapi,
  bucketId: number,
  userId: number
) {
  const bucket = await strapi.db.query('api::bucket.bucket').findOne({
    where: { id: bucketId, owner: userId },
  });

  if (!bucket) {
    throw new Error('Bucket not found');
  }

  return bucket;
}

async function logActivity(
  strapi: Strapi.Strapi,
  action: string,
  userId: number,
  bucketId: number,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const activityService = strapi.service('api::activity.activity');
    if (activityService && typeof activityService.create === 'function') {
      await activityService.create({
        data: {
          type: 'object',
          action,
          resourceId: String(bucketId),
          user: userId,
          details,
        },
      });
    }
  } catch {
    strapi.log.debug('Activity logging not available');
  }
}

async function updateBucketStats(
  strapi: Strapi.Strapi,
  bucketId: number,
  bucketName: string
): Promise<void> {
  try {
    const spomen = getSpomenClient();
    const bucket = await spomen.getBucket(bucketName);

    await strapi.db.query('api::bucket.bucket').update({
      where: { id: bucketId },
      data: {
        objectCount: String(bucket.object_count || 0),
        totalSize: String(bucket.total_size || 0),
        lastSyncedAt: new Date().toISOString(),
      },
    });
  } catch {
    // Ignore sync errors
  }
}

// =============================================================================
// Service Factory
// =============================================================================

export default ({ strapi }: { strapi: Strapi.Strapi }) => ({
  // ===========================================================================
  // List Objects
  // ===========================================================================

  async list(
    bucketId: number,
    userId: number,
    params: ListObjectsParams = {}
  ): Promise<SpomenObjectList> {
    const bucket = await getBucketByIdOrThrow(strapi, bucketId, userId);
    const spomen = getSpomenClient();

    try {
      const result = await spomen.listObjects(bucket.name, {
        prefix: params.prefix,
        delimiter: params.delimiter,
        marker: params.marker,
        maxKeys: params.maxKeys,
      });

      return {
        ...result,
        objects: (result.objects || []).map((object) => normalizeObjectContentType(object)),
      };
    } catch (error) {
      if (error instanceof SpomenClientError) {
        throw new Error(`Failed to list objects: ${error.message}`);
      }
      throw error;
    }
  },

  // ===========================================================================
  // Get Object Info
  // ===========================================================================

  async getInfo(
    bucketId: number,
    key: string,
    userId: number
  ): Promise<SpomenObject> {
    const bucket = await getBucketByIdOrThrow(strapi, bucketId, userId);
    const spomen = getSpomenClient();

    try {
      const result = await spomen.getObjectInfo(bucket.name, key);
      return normalizeObjectContentType(result);
    } catch (error) {
      if (error instanceof SpomenClientError) {
        throw new Error(`Object not found: ${error.message}`);
      }
      throw error;
    }
  },

  // ===========================================================================
  // Download Object
  // ===========================================================================

  async download(
    bucketId: number,
    key: string,
    userId: number
  ): Promise<Response> {
    const bucket = await getBucketByIdOrThrow(strapi, bucketId, userId);
    const spomen = getSpomenClient();

    try {
      return await spomen.getObject(bucket.name, key);
    } catch (error) {
      if (error instanceof SpomenClientError) {
        throw new Error(`Failed to download object: ${error.message}`);
      }
      throw error;
    }
  },

  // ===========================================================================
  // Upload Object
  // ===========================================================================

  async upload(
    bucketId: number,
    userId: number,
    params: UploadObjectParams
  ): Promise<SpomenObject> {
    const bucket = await getBucketByIdOrThrow(strapi, bucketId, userId);
    const spomen = getSpomenClient();

    try {
      const result = await spomen.putObject(bucket.name, params.key, params.data, {
        contentType: params.contentType,
        contentLength: params.contentLength,
        metadata: params.metadata,
      });
      const normalizedResult = normalizeObjectContentType(result, params.contentType);

      // Update bucket stats asynchronously
      updateBucketStats(strapi, bucketId, bucket.name);

      // Log activity
      await logActivity(strapi, 'upload', userId, bucketId, {
        key: params.key,
        size: normalizedResult.size,
        contentType: normalizedResult.content_type,
      });

      return normalizedResult;
    } catch (error) {
      if (error instanceof SpomenClientError) {
        throw new Error(`Failed to upload object: ${error.message}`);
      }
      throw error;
    }
  },

  // ===========================================================================
  // Delete Object
  // ===========================================================================

  async delete(
    bucketId: number,
    key: string,
    userId: number
  ): Promise<{ message: string; key: string }> {
    const bucket = await getBucketByIdOrThrow(strapi, bucketId, userId);
    const spomen = getSpomenClient();

    try {
      const result = await spomen.deleteObject(bucket.name, key);

      // Update bucket stats asynchronously
      updateBucketStats(strapi, bucketId, bucket.name);

      // Log activity
      await logActivity(strapi, 'delete', userId, bucketId, { key });

      return result;
    } catch (error) {
      if (error instanceof SpomenClientError) {
        throw new Error(`Failed to delete object: ${error.message}`);
      }
      throw error;
    }
  },

  // ===========================================================================
  // Delete Multiple Objects
  // ===========================================================================

  async deleteMany(
    bucketId: number,
    keys: string[],
    userId: number
  ): Promise<{ deleted: string[]; errors: string[] }> {
    const bucket = await getBucketByIdOrThrow(strapi, bucketId, userId);
    const spomen = getSpomenClient();

    try {
      const result = await spomen.deleteObjects(bucket.name, keys);

      // Update bucket stats asynchronously
      updateBucketStats(strapi, bucketId, bucket.name);

      // Log activity
      await logActivity(strapi, 'deleteMany', userId, bucketId, {
        deletedCount: result.deleted.length,
        errorCount: result.errors.length,
      });

      return result;
    } catch (error) {
      if (error instanceof SpomenClientError) {
        throw new Error(`Failed to delete objects: ${error.message}`);
      }
      throw error;
    }
  },

  // ===========================================================================
  // Delete Folder (recursive by prefix)
  // ===========================================================================

  async deleteFolder(
    bucketId: number,
    prefix: string,
    userId: number
  ): Promise<DeleteFolderResult> {
    const bucket = await getBucketByIdOrThrow(strapi, bucketId, userId);
    const spomen = getSpomenClient();

    const normalizedPrefix = `${prefix.replace(/^\/+/, '').replace(/\/+$/, '')}/`;
    if (!normalizedPrefix || normalizedPrefix === '/') {
      throw new Error('Folder prefix is required');
    }

    const allKeys: string[] = [];
    let marker: string | undefined;

    try {
      do {
        const page = await spomen.listObjects(bucket.name, {
          prefix: normalizedPrefix,
          marker,
          maxKeys: 1000,
        });

        for (const object of page.objects || []) {
          allKeys.push(object.key);
        }

        marker = page.is_truncated ? page.next_marker : undefined;
      } while (marker);

      if (!allKeys.includes(normalizedPrefix)) {
        allKeys.push(normalizedPrefix);
      }

      const uniqueKeys = Array.from(new Set(allKeys));
      if (uniqueKeys.length === 0) {
        return { deleted: [], errors: [] };
      }

      const deleted: string[] = [];
      const errors: string[] = [];
      const chunkSize = 1000;

      for (let i = 0; i < uniqueKeys.length; i += chunkSize) {
        const chunk = uniqueKeys.slice(i, i + chunkSize);
        const result = await spomen.deleteObjects(bucket.name, chunk);
        deleted.push(...(result.deleted || []));
        errors.push(...(result.errors || []));
      }

      updateBucketStats(strapi, bucketId, bucket.name);

      await logActivity(strapi, 'deleteFolder', userId, bucketId, {
        prefix: normalizedPrefix,
        deletedCount: deleted.length,
        errorCount: errors.length,
      });

      return { deleted, errors };
    } catch (error) {
      if (error instanceof SpomenClientError) {
        throw new Error(`Failed to delete folder: ${error.message}`);
      }
      throw error;
    }
  },

  // ===========================================================================
  // Copy Object
  // ===========================================================================

  async copy(
    bucketId: number,
    userId: number,
    params: CopyObjectParams
  ): Promise<SpomenObject> {
    const bucket = await getBucketByIdOrThrow(strapi, bucketId, userId);
    const spomen = getSpomenClient();

    const copyRequest: SpomenCopyObjectRequest = {
      source_bucket: params.sourceBucket || bucket.name,
      source_key: params.sourceKey,
      dest_key: params.destKey,
      metadata: params.metadata,
    };

    try {
      const result = await spomen.copyObject(bucket.name, copyRequest);
      const normalizedResult = normalizeObjectContentType(result);

      // Update bucket stats asynchronously
      updateBucketStats(strapi, bucketId, bucket.name);

      // Log activity
      await logActivity(strapi, 'copy', userId, bucketId, {
        sourceKey: params.sourceKey,
        destKey: params.destKey,
      });

      return normalizedResult;
    } catch (error) {
      if (error instanceof SpomenClientError) {
        throw new Error(`Failed to copy object: ${error.message}`);
      }
      throw error;
    }
  },

  // ===========================================================================
  // Generate Presigned URL
  // ===========================================================================

  async getPresignedUrl(
    bucketId: number,
    userId: number,
    params: SpomenPresignedURLRequest
  ): Promise<SpomenPresignedURLResponse> {
    const bucket = await getBucketByIdOrThrow(strapi, bucketId, userId);
    const spomen = getSpomenClient();

    try {
      return await spomen.getPresignedUrl(bucket.name, params);
    } catch (error) {
      if (error instanceof SpomenClientError) {
        throw new Error(`Failed to generate presigned URL: ${error.message}`);
      }
      throw error;
    }
  },
});
