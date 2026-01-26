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
      return await spomen.listObjects(bucket.name, {
        prefix: params.prefix,
        delimiter: params.delimiter,
        marker: params.marker,
        maxKeys: params.maxKeys,
      });
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
      return await spomen.getObjectInfo(bucket.name, key);
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

      // Update bucket stats asynchronously
      updateBucketStats(strapi, bucketId, bucket.name);

      // Log activity
      await logActivity(strapi, 'upload', userId, bucketId, {
        key: params.key,
        size: result.size,
        contentType: result.content_type,
      });

      return result;
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

      // Update bucket stats asynchronously
      updateBucketStats(strapi, bucketId, bucket.name);

      // Log activity
      await logActivity(strapi, 'copy', userId, bucketId, {
        sourceKey: params.sourceKey,
        destKey: params.destKey,
      });

      return result;
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
