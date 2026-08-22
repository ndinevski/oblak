/**
 * Bucket Service
 * Business logic for bucket operations with Spomen integration
 */

import {
  createSpomenClient,
  SpomenClient,
  SpomenClientError,
  type SpomenBucket,
} from './spomen-client';

// =============================================================================
// Types
// =============================================================================

interface BucketData {
  id: number;
  name: string;
  policy: 'private' | 'public-read' | 'public-read-write';
  versioning: boolean;
  objectCount: string;
  totalSize: string;
  tags: Record<string, string>;
  description?: string;
  corsConfiguration?: unknown;
  lifecycleRules?: unknown;
  quotaBytes?: string;
  owner: { id: number };
  createdAt: string;
  updatedAt: string;
}

interface CreateBucketInput {
  name: string;
  policy?: 'private' | 'public-read' | 'public-read-write';
  versioning?: boolean;
  tags?: Record<string, string>;
  description?: string;
  quotaBytes?: string;
}

interface UpdateBucketInput {
  policy?: 'private' | 'public-read' | 'public-read-write';
  versioning?: boolean;
  tags?: Record<string, string>;
  description?: string;
  corsConfiguration?: unknown;
  lifecycleRules?: unknown;
  quotaBytes?: string;
}

interface BucketStats {
  objectCount: number;
  totalSize: number;
  sizeByContentType: Record<string, number>;
  recentObjects: number;
}

interface IssuedBucketCredentials {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  region: string;
  buckets: string[];
  expiresAt?: string;
}

// =============================================================================
// Quota Management
// =============================================================================

const DEFAULT_QUOTAS = {
  maxBucketsPerUser: 10,
  maxTotalSizePerUser: 10 * 1024 * 1024 * 1024, // 10GB
};

interface QuotaUsage {
  bucketCount: number;
  totalSize: number;
}

async function getUserQuotaUsage(
  strapi: Strapi.Strapi,
  userId: number
): Promise<QuotaUsage> {
  const buckets = await strapi.db.query('api::bucket.bucket').findMany({
    where: { owner: userId },
    select: ['totalSize'],
  });

  const bucketCount = buckets.length;
  const totalSize = buckets.reduce(
    (sum, b) => sum + parseInt(b.totalSize || '0', 10),
    0
  );

  return { bucketCount, totalSize };
}

async function checkQuota(
  strapi: Strapi.Strapi,
  userId: number,
  additionalSize = 0
): Promise<void> {
  const usage = await getUserQuotaUsage(strapi, userId);

  if (usage.bucketCount >= DEFAULT_QUOTAS.maxBucketsPerUser) {
    throw new Error(
      `Bucket quota exceeded. Maximum ${DEFAULT_QUOTAS.maxBucketsPerUser} buckets allowed.`
    );
  }

  if (usage.totalSize + additionalSize > DEFAULT_QUOTAS.maxTotalSizePerUser) {
    throw new Error(
      `Storage quota exceeded. Maximum ${DEFAULT_QUOTAS.maxTotalSizePerUser / (1024 * 1024 * 1024)}GB allowed.`
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function getSpomenClient(): SpomenClient {
  const baseUrl = process.env.SPOMEN_URL || 'http://localhost:8083';
  return createSpomenClient({ baseUrl });
}

function mapSpomenBucketToStrapi(
  bucket: SpomenBucket
): Partial<BucketData> {
  return {
    name: bucket.name,
    policy: bucket.policy || 'private',
    versioning: bucket.versioning,
    objectCount: String(bucket.object_count || 0),
    totalSize: String(bucket.total_size || 0),
    tags: bucket.tags || {},
  };
}

async function logActivity(
  strapi: Strapi.Strapi,
  action: string,
  userId: number,
  bucketId: number,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    // Log activity if activity content type exists
    const activityService = strapi.service('api::activity.activity');
    if (activityService && typeof activityService.create === 'function') {
      await activityService.create({
        data: {
          type: 'bucket',
          action,
          resourceId: String(bucketId),
          user: userId,
          details,
        },
      });
    }
  } catch {
    // Silently ignore if activity logging fails
    strapi.log.debug('Activity logging not available');
  }
}

// =============================================================================
// Service Factory
// =============================================================================

export default ({ strapi }: { strapi: Strapi.Strapi }) => ({
  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  async find(userId: number, params: Record<string, unknown> = {}) {
    const { pagination, sort, filters } = params as {
      pagination?: { page?: number; pageSize?: number };
      sort?: string | string[];
      filters?: Record<string, unknown>;
    };

    const where = {
      owner: userId,
      ...filters,
    };

    const buckets = await strapi.db.query('api::bucket.bucket').findMany({
      where,
      orderBy: sort ? { [sort as string]: 'asc' } : { createdAt: 'desc' },
      limit: pagination?.pageSize || 25,
      offset: ((pagination?.page || 1) - 1) * (pagination?.pageSize || 25),
      populate: ['owner'],
    });

    const total = await strapi.db.query('api::bucket.bucket').count({ where });

    return {
      data: buckets,
      meta: {
        pagination: {
          page: pagination?.page || 1,
          pageSize: pagination?.pageSize || 25,
          pageCount: Math.ceil(total / (pagination?.pageSize || 25)),
          total,
        },
      },
    };
  },

  async findOne(bucketId: number, userId: number) {
    const bucket = await strapi.db.query('api::bucket.bucket').findOne({
      where: { id: bucketId, owner: userId },
      populate: ['owner'],
    });

    if (!bucket) {
      throw new Error('Bucket not found');
    }

    return bucket;
  },

  async findByName(name: string, userId: number) {
    const bucket = await strapi.db.query('api::bucket.bucket').findOne({
      where: { name, owner: userId },
      populate: ['owner'],
    });

    return bucket;
  },

  // ===========================================================================
  // Create Bucket
  // ===========================================================================

  async create(data: CreateBucketInput, userId: number) {
    // Check quota
    await checkQuota(strapi, userId);

    // Check if bucket name is already taken
    const existing = await strapi.db.query('api::bucket.bucket').findOne({
      where: { name: data.name },
    });

    if (existing) {
      throw new Error('Bucket name is already taken');
    }

    // Create in Strapi first
    const bucket = await strapi.db.query('api::bucket.bucket').create({
      data: {
        name: data.name,
        policy: data.policy || 'private',
        versioning: data.versioning || false,
        tags: data.tags || {},
        description: data.description,
        quotaBytes: data.quotaBytes,
        objectCount: '0',
        totalSize: '0',
        externalSynced: false,
        owner: userId,
      },
    });

    try {
      // Create in Spomen
      const spomen = getSpomenClient();
      await spomen.createBucket({
        name: data.name,
        policy: data.policy,
        versioning: data.versioning,
        tags: data.tags,
      });

      // Mark as synced
      await strapi.db.query('api::bucket.bucket').update({
        where: { id: bucket.id },
        data: {
          externalSynced: true,
          lastSyncedAt: new Date().toISOString(),
        },
      });

      // Log activity
      await logActivity(strapi, 'create', userId, bucket.id, { name: data.name });

      return bucket;
    } catch (error) {
      // Rollback Strapi creation if Spomen fails
      await strapi.db.query('api::bucket.bucket').delete({
        where: { id: bucket.id },
      });

      if (error instanceof SpomenClientError) {
        throw new Error(`Failed to create bucket in storage: ${error.message}`);
      }
      throw error;
    }
  },

  // ===========================================================================
  // Update Bucket
  // ===========================================================================

  async update(bucketId: number, data: UpdateBucketInput, userId: number) {
    const bucket = await this.findOne(bucketId, userId);

    // Update in Spomen first
    const spomen = getSpomenClient();
    try {
      await spomen.updateBucket(bucket.name, {
        policy: data.policy,
        versioning: data.versioning,
        tags: data.tags,
      });
    } catch (error) {
      if (error instanceof SpomenClientError) {
        throw new Error(`Failed to update bucket in storage: ${error.message}`);
      }
      throw error;
    }

    // Update in Strapi
    const updated = await strapi.db.query('api::bucket.bucket').update({
      where: { id: bucketId },
      data: {
        ...data,
        lastSyncedAt: new Date().toISOString(),
      },
    });

    // Log activity
    await logActivity(strapi, 'update', userId, bucketId, data as Record<string, unknown>);

    return updated;
  },

  // ===========================================================================
  // Delete Bucket
  // ===========================================================================

  async delete(bucketId: number, userId: number, force = false) {
    const bucket = await this.findOne(bucketId, userId);

    // Delete from Spomen
    const spomen = getSpomenClient();
    try {
      await spomen.deleteBucket(bucket.name, force);
    } catch (error) {
      if (error instanceof SpomenClientError) {
        // If bucket doesn't exist in Spomen, still delete from Strapi
        if (error.statusCode !== 404) {
          throw new Error(`Failed to delete bucket from storage: ${error.message}`);
        }
      } else {
        throw error;
      }
    }

    // Delete from Strapi
    await strapi.db.query('api::bucket.bucket').delete({
      where: { id: bucketId },
    });

    // Log activity
    await logActivity(strapi, 'delete', userId, bucketId, { name: bucket.name });

    return { message: 'Bucket deleted successfully', name: bucket.name };
  },

  // ===========================================================================
  // Sync Bucket
  // ===========================================================================

  async sync(bucketId: number, userId: number) {
    const bucket = await this.findOne(bucketId, userId);

    const spomen = getSpomenClient();
    const spomenBucket = await spomen.getBucket(bucket.name);
    const mappedData = mapSpomenBucketToStrapi(spomenBucket);

    const updated = await strapi.db.query('api::bucket.bucket').update({
      where: { id: bucketId },
      data: {
        ...mappedData,
        externalSynced: true,
        lastSyncedAt: new Date().toISOString(),
      },
    });

    return updated;
  },

  // ===========================================================================
  // Get Bucket Stats
  // ===========================================================================

  async getStats(bucketId: number, userId: number): Promise<BucketStats> {
    const bucket = await this.findOne(bucketId, userId);

    // Get fresh stats from Spomen
    const spomen = getSpomenClient();
    const spomenBucket = await spomen.getBucket(bucket.name);

    // Get object list for content type breakdown
    const objectList = await spomen.listObjects(bucket.name, { maxKeys: 1000 });

    const sizeByContentType: Record<string, number> = {};
    let recentObjects = 0;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const obj of objectList.objects) {
      const contentType = obj.content_type || 'application/octet-stream';
      sizeByContentType[contentType] =
        (sizeByContentType[contentType] || 0) + obj.size;

      if (new Date(obj.last_modified).getTime() > oneDayAgo) {
        recentObjects++;
      }
    }

    return {
      objectCount: spomenBucket.object_count || 0,
      totalSize: spomenBucket.total_size || 0,
      sizeByContentType,
      recentObjects,
    };
  },

  // ===========================================================================
  // Quota Info
  // ===========================================================================

  async getQuotaUsage(userId: number): Promise<QuotaUsage & { limits: typeof DEFAULT_QUOTAS }> {
    const usage = await getUserQuotaUsage(strapi, userId);
    return {
      ...usage,
      limits: DEFAULT_QUOTAS,
    };
  },

  // ===========================================================================
  // Issue Bucket Access Credentials
  // ===========================================================================

  async issueBucketCredentials(
    bucketId: number,
    userId: number,
    readWrite = true
  ): Promise<IssuedBucketCredentials> {
    const bucket = await this.findOne(bucketId, userId);
    const spomen = getSpomenClient();

    try {
      const issued = await spomen.issueCredentials({
        user_id: userId,
        buckets: [bucket.name],
        read_write: readWrite,
      });

      return {
        accessKey: issued.access_key,
        secretKey: issued.secret_key,
        endpoint: issued.endpoint,
        region: issued.region,
        buckets: issued.buckets,
        expiresAt: issued.expires_at,
      };
    } catch (error) {
      if (error instanceof SpomenClientError) {
        throw new Error(`Failed to issue credentials: ${error.message}`);
      }
      throw error;
    }
  },
});
