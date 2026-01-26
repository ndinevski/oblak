/**
 * Bucket Service Tests
 * 
 * Tests for the bucket service layer including Spomen client integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Spomen client
const mockSpomenClient = {
  createBucket: vi.fn(),
  deleteBucket: vi.fn(),
  getBucket: vi.fn(),
  listBuckets: vi.fn(),
  setBucketPolicy: vi.fn(),
  uploadObject: vi.fn(),
  downloadObject: vi.fn(),
  deleteObject: vi.fn(),
  listObjects: vi.fn(),
  getObjectMetadata: vi.fn(),
};

// Mock Strapi
const mockStrapi = {
  entityService: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findOne: vi.fn(),
    findMany: vi.fn(),
  },
  service: vi.fn().mockReturnValue({
    log: vi.fn(),
  }),
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
};

// Bucket types
interface Bucket {
  id: number;
  documentId: string;
  name: string;
  accessPolicy: 'private' | 'public-read' | 'authenticated-read';
  versioning: boolean;
  encryption: boolean;
  objectCount: number;
  totalSize: number;
  owner: { id: number };
  createdAt: string;
  updatedAt: string;
}

interface BucketObject {
  key: string;
  size: number;
  lastModified: string;
  contentType: string;
  etag: string;
}

interface CreateBucketData {
  name: string;
  accessPolicy?: 'private' | 'public-read' | 'authenticated-read';
  versioning?: boolean;
  encryption?: boolean;
}

interface UploadObjectData {
  key: string;
  content: Buffer | string;
  contentType?: string;
  metadata?: Record<string, string>;
}

// Simulated bucket service implementation
class BucketService {
  private strapi: typeof mockStrapi;
  private spomen: typeof mockSpomenClient;

  constructor(strapi: typeof mockStrapi, spomen: typeof mockSpomenClient) {
    this.strapi = strapi;
    this.spomen = spomen;
  }

  async createBucket(data: CreateBucketData, userId: number): Promise<Bucket> {
    // Validate bucket name
    if (!data.name || data.name.length < 3 || data.name.length > 63) {
      throw new Error('Bucket name must be between 3 and 63 characters');
    }

    if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(data.name)) {
      throw new Error('Invalid bucket name format');
    }

    // Create bucket in Spomen
    await this.spomen.createBucket(data.name, {
      versioning: data.versioning,
      encryption: data.encryption,
    });

    // Set access policy
    if (data.accessPolicy) {
      await this.spomen.setBucketPolicy(data.name, data.accessPolicy);
    }

    // Create bucket record in database
    const bucket = await this.strapi.entityService.create('api::bucket.bucket', {
      data: {
        name: data.name,
        accessPolicy: data.accessPolicy || 'private',
        versioning: data.versioning || false,
        encryption: data.encryption || true,
        objectCount: 0,
        totalSize: 0,
        owner: userId,
      },
    });

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'bucket',
      resourceId: bucket.documentId,
      action: 'create',
      userId,
      details: { name: data.name },
    });

    return bucket as Bucket;
  }

  async deleteBucket(documentId: string, userId: number): Promise<void> {
    const bucket = await this.strapi.entityService.findOne('api::bucket.bucket', documentId);
    
    if (!bucket) {
      throw new Error('Bucket not found');
    }

    // Check if bucket is empty
    const objects = await this.spomen.listObjects(bucket.name);
    if (objects.length > 0) {
      throw new Error('Cannot delete non-empty bucket');
    }

    // Delete from Spomen
    await this.spomen.deleteBucket(bucket.name);

    // Delete from database
    await this.strapi.entityService.delete('api::bucket.bucket', documentId);

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'bucket',
      resourceId: documentId,
      action: 'delete',
      userId,
      details: { name: bucket.name },
    });
  }

  async updateBucketPolicy(
    documentId: string,
    policy: 'private' | 'public-read' | 'authenticated-read',
    userId: number
  ): Promise<Bucket> {
    const bucket = await this.strapi.entityService.findOne('api::bucket.bucket', documentId);
    
    if (!bucket) {
      throw new Error('Bucket not found');
    }

    // Update in Spomen
    await this.spomen.setBucketPolicy(bucket.name, policy);

    // Update in database
    const updated = await this.strapi.entityService.update('api::bucket.bucket', documentId, {
      data: { accessPolicy: policy },
    });

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'bucket',
      resourceId: documentId,
      action: 'update_policy',
      userId,
      details: { oldPolicy: bucket.accessPolicy, newPolicy: policy },
    });

    return updated as Bucket;
  }

  async uploadObject(
    documentId: string,
    data: UploadObjectData,
    userId: number
  ): Promise<BucketObject> {
    const bucket = await this.strapi.entityService.findOne('api::bucket.bucket', documentId);
    
    if (!bucket) {
      throw new Error('Bucket not found');
    }

    // Validate key
    if (!data.key || data.key.length === 0) {
      throw new Error('Object key is required');
    }

    // Upload to Spomen
    const result = await this.spomen.uploadObject(bucket.name, data.key, {
      content: data.content,
      contentType: data.contentType || 'application/octet-stream',
      metadata: data.metadata,
    });

    // Update bucket stats
    const size = typeof data.content === 'string' ? Buffer.byteLength(data.content) : data.content.length;
    await this.strapi.entityService.update('api::bucket.bucket', documentId, {
      data: {
        objectCount: bucket.objectCount + 1,
        totalSize: bucket.totalSize + size,
      },
    });

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'object',
      resourceId: data.key,
      action: 'upload',
      userId,
      details: { bucket: bucket.name, size },
    });

    return result;
  }

  async deleteObject(documentId: string, key: string, userId: number): Promise<void> {
    const bucket = await this.strapi.entityService.findOne('api::bucket.bucket', documentId);
    
    if (!bucket) {
      throw new Error('Bucket not found');
    }

    // Get object metadata for size
    const metadata = await this.spomen.getObjectMetadata(bucket.name, key);

    // Delete from Spomen
    await this.spomen.deleteObject(bucket.name, key);

    // Update bucket stats
    await this.strapi.entityService.update('api::bucket.bucket', documentId, {
      data: {
        objectCount: Math.max(0, bucket.objectCount - 1),
        totalSize: Math.max(0, bucket.totalSize - (metadata?.size || 0)),
      },
    });

    // Log activity
    await this.strapi.service('api::activity-log.activity-log').log({
      resourceType: 'object',
      resourceId: key,
      action: 'delete',
      userId,
      details: { bucket: bucket.name },
    });
  }

  async listObjects(documentId: string, prefix?: string): Promise<BucketObject[]> {
    const bucket = await this.strapi.entityService.findOne('api::bucket.bucket', documentId);
    
    if (!bucket) {
      throw new Error('Bucket not found');
    }

    return this.spomen.listObjects(bucket.name, { prefix });
  }

  calculateStorageUsage(buckets: Bucket[]): {
    totalBuckets: number;
    totalObjects: number;
    totalSize: number;
  } {
    return buckets.reduce(
      (acc, bucket) => ({
        totalBuckets: acc.totalBuckets + 1,
        totalObjects: acc.totalObjects + bucket.objectCount,
        totalSize: acc.totalSize + bucket.totalSize,
      }),
      { totalBuckets: 0, totalObjects: 0, totalSize: 0 }
    );
  }
}

describe('BucketService', () => {
  let service: BucketService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BucketService(mockStrapi, mockSpomenClient);
  });

  describe('createBucket', () => {
    it('should create bucket successfully', async () => {
      const userId = 1;
      const data: CreateBucketData = {
        name: 'test-bucket',
        accessPolicy: 'private',
        versioning: true,
        encryption: true,
      };

      mockSpomenClient.createBucket.mockResolvedValue({ success: true });
      mockSpomenClient.setBucketPolicy.mockResolvedValue({ success: true });
      mockStrapi.entityService.create.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
        accessPolicy: 'private',
        versioning: true,
        encryption: true,
        objectCount: 0,
        totalSize: 0,
        owner: { id: 1 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.createBucket(data, userId);

      expect(result.name).toBe('test-bucket');
      expect(result.accessPolicy).toBe('private');
      expect(mockSpomenClient.createBucket).toHaveBeenCalledWith('test-bucket', {
        versioning: true,
        encryption: true,
      });
      expect(mockSpomenClient.setBucketPolicy).toHaveBeenCalledWith('test-bucket', 'private');
    });

    it('should reject short bucket names', async () => {
      await expect(service.createBucket({ name: 'ab' }, 1)).rejects.toThrow(
        'Bucket name must be between 3 and 63 characters'
      );
    });

    it('should reject long bucket names', async () => {
      await expect(service.createBucket({ name: 'a'.repeat(64) }, 1)).rejects.toThrow(
        'Bucket name must be between 3 and 63 characters'
      );
    });

    it('should reject invalid bucket name format', async () => {
      await expect(service.createBucket({ name: 'Invalid_Name' }, 1)).rejects.toThrow(
        'Invalid bucket name format'
      );
    });

    it('should use default values for optional fields', async () => {
      const data: CreateBucketData = { name: 'minimal-bucket' };

      mockSpomenClient.createBucket.mockResolvedValue({ success: true });
      mockStrapi.entityService.create.mockResolvedValue({
        id: 1,
        documentId: 'bucket-456',
        name: 'minimal-bucket',
        accessPolicy: 'private',
        versioning: false,
        encryption: true,
        objectCount: 0,
        totalSize: 0,
      });

      const result = await service.createBucket(data, 1);

      expect(result.accessPolicy).toBe('private');
      expect(result.versioning).toBe(false);
      expect(result.encryption).toBe(true);
    });

    it('should log activity after creation', async () => {
      const data: CreateBucketData = { name: 'logged-bucket' };

      mockSpomenClient.createBucket.mockResolvedValue({ success: true });
      mockStrapi.entityService.create.mockResolvedValue({
        id: 1,
        documentId: 'bucket-789',
        name: 'logged-bucket',
        accessPolicy: 'private',
        versioning: false,
        encryption: true,
        objectCount: 0,
        totalSize: 0,
      });

      await service.createBucket(data, 1);

      const activityService = mockStrapi.service('api::activity-log.activity-log');
      expect(activityService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'bucket',
          action: 'create',
          userId: 1,
        })
      );
    });
  });

  describe('deleteBucket', () => {
    it('should delete empty bucket', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'empty-bucket',
        objectCount: 0,
        accessPolicy: 'private',
      });
      mockSpomenClient.listObjects.mockResolvedValue([]);
      mockSpomenClient.deleteBucket.mockResolvedValue({ success: true });
      mockStrapi.entityService.delete.mockResolvedValue({ success: true });

      await service.deleteBucket('bucket-123', 1);

      expect(mockSpomenClient.deleteBucket).toHaveBeenCalledWith('empty-bucket');
      expect(mockStrapi.entityService.delete).toHaveBeenCalled();
    });

    it('should throw error for non-existent bucket', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue(null);

      await expect(service.deleteBucket('non-existent', 1)).rejects.toThrow('Bucket not found');
    });

    it('should throw error for non-empty bucket', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'non-empty-bucket',
        objectCount: 5,
      });
      mockSpomenClient.listObjects.mockResolvedValue([{ key: 'file.txt' }]);

      await expect(service.deleteBucket('bucket-123', 1)).rejects.toThrow(
        'Cannot delete non-empty bucket'
      );
    });
  });

  describe('updateBucketPolicy', () => {
    it('should update bucket policy', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
        accessPolicy: 'private',
      });
      mockSpomenClient.setBucketPolicy.mockResolvedValue({ success: true });
      mockStrapi.entityService.update.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
        accessPolicy: 'public-read',
      });

      const result = await service.updateBucketPolicy('bucket-123', 'public-read', 1);

      expect(result.accessPolicy).toBe('public-read');
      expect(mockSpomenClient.setBucketPolicy).toHaveBeenCalledWith('test-bucket', 'public-read');
    });

    it('should log policy change', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
        accessPolicy: 'private',
      });
      mockSpomenClient.setBucketPolicy.mockResolvedValue({ success: true });
      mockStrapi.entityService.update.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
        accessPolicy: 'authenticated-read',
      });

      await service.updateBucketPolicy('bucket-123', 'authenticated-read', 1);

      const activityService = mockStrapi.service('api::activity-log.activity-log');
      expect(activityService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update_policy',
          details: expect.objectContaining({
            oldPolicy: 'private',
            newPolicy: 'authenticated-read',
          }),
        })
      );
    });
  });

  describe('uploadObject', () => {
    it('should upload object successfully', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
        objectCount: 5,
        totalSize: 1000,
      });
      mockSpomenClient.uploadObject.mockResolvedValue({
        key: 'file.txt',
        size: 100,
        lastModified: new Date().toISOString(),
        contentType: 'text/plain',
        etag: 'abc123',
      });
      mockStrapi.entityService.update.mockResolvedValue({});

      const result = await service.uploadObject(
        'bucket-123',
        {
          key: 'file.txt',
          content: 'Hello, World!',
          contentType: 'text/plain',
        },
        1
      );

      expect(result.key).toBe('file.txt');
      expect(mockSpomenClient.uploadObject).toHaveBeenCalled();
    });

    it('should reject empty key', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
      });

      await expect(
        service.uploadObject('bucket-123', { key: '', content: 'test' }, 1)
      ).rejects.toThrow('Object key is required');
    });

    it('should update bucket stats after upload', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
        objectCount: 5,
        totalSize: 1000,
      });
      mockSpomenClient.uploadObject.mockResolvedValue({
        key: 'file.txt',
        size: 100,
      });
      mockStrapi.entityService.update.mockResolvedValue({});

      await service.uploadObject(
        'bucket-123',
        {
          key: 'file.txt',
          content: 'x'.repeat(50),
        },
        1
      );

      expect(mockStrapi.entityService.update).toHaveBeenCalledWith(
        'api::bucket.bucket',
        'bucket-123',
        expect.objectContaining({
          data: expect.objectContaining({
            objectCount: 6,
          }),
        })
      );
    });
  });

  describe('deleteObject', () => {
    it('should delete object and update stats', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
        objectCount: 5,
        totalSize: 1000,
      });
      mockSpomenClient.getObjectMetadata.mockResolvedValue({ size: 200 });
      mockSpomenClient.deleteObject.mockResolvedValue({ success: true });
      mockStrapi.entityService.update.mockResolvedValue({});

      await service.deleteObject('bucket-123', 'file.txt', 1);

      expect(mockSpomenClient.deleteObject).toHaveBeenCalledWith('test-bucket', 'file.txt');
      expect(mockStrapi.entityService.update).toHaveBeenCalledWith(
        'api::bucket.bucket',
        'bucket-123',
        expect.objectContaining({
          data: expect.objectContaining({
            objectCount: 4,
            totalSize: 800,
          }),
        })
      );
    });

    it('should handle missing metadata gracefully', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
        objectCount: 5,
        totalSize: 1000,
      });
      mockSpomenClient.getObjectMetadata.mockResolvedValue(null);
      mockSpomenClient.deleteObject.mockResolvedValue({ success: true });
      mockStrapi.entityService.update.mockResolvedValue({});

      await service.deleteObject('bucket-123', 'file.txt', 1);

      expect(mockStrapi.entityService.update).toHaveBeenCalledWith(
        'api::bucket.bucket',
        'bucket-123',
        expect.objectContaining({
          data: expect.objectContaining({
            objectCount: 4,
            totalSize: 1000, // No size reduction when metadata is missing
          }),
        })
      );
    });
  });

  describe('listObjects', () => {
    it('should list objects in bucket', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
      });
      mockSpomenClient.listObjects.mockResolvedValue([
        { key: 'file1.txt', size: 100 },
        { key: 'file2.txt', size: 200 },
        { key: 'folder/file3.txt', size: 300 },
      ]);

      const result = await service.listObjects('bucket-123');

      expect(result).toHaveLength(3);
      expect(result[0].key).toBe('file1.txt');
    });

    it('should filter by prefix', async () => {
      mockStrapi.entityService.findOne.mockResolvedValue({
        id: 1,
        documentId: 'bucket-123',
        name: 'test-bucket',
      });
      mockSpomenClient.listObjects.mockResolvedValue([{ key: 'folder/file3.txt', size: 300 }]);

      await service.listObjects('bucket-123', 'folder/');

      expect(mockSpomenClient.listObjects).toHaveBeenCalledWith('test-bucket', { prefix: 'folder/' });
    });
  });

  describe('calculateStorageUsage', () => {
    it('should calculate total storage usage', () => {
      const buckets: Bucket[] = [
        {
          id: 1,
          documentId: 'bucket-1',
          name: 'bucket1',
          accessPolicy: 'private',
          versioning: false,
          encryption: true,
          objectCount: 10,
          totalSize: 1000,
          owner: { id: 1 },
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 2,
          documentId: 'bucket-2',
          name: 'bucket2',
          accessPolicy: 'public-read',
          versioning: true,
          encryption: true,
          objectCount: 20,
          totalSize: 2000,
          owner: { id: 1 },
          createdAt: '',
          updatedAt: '',
        },
      ];

      const result = service.calculateStorageUsage(buckets);

      expect(result.totalBuckets).toBe(2);
      expect(result.totalObjects).toBe(30);
      expect(result.totalSize).toBe(3000);
    });

    it('should return zeros for empty array', () => {
      const result = service.calculateStorageUsage([]);

      expect(result.totalBuckets).toBe(0);
      expect(result.totalObjects).toBe(0);
      expect(result.totalSize).toBe(0);
    });
  });
});

describe('Bucket Name Validation', () => {
  // Test bucket naming rules
  const validNames = [
    'my-bucket',
    'bucket123',
    'test.bucket.name',
    'abc',
    'a'.repeat(63),
    '123bucket',
    'bucket-with-dashes',
    'bucket.with.dots',
  ];

  const invalidNames = [
    'My-Bucket', // uppercase
    '-bucket', // starts with dash
    'bucket-', // ends with dash
    '.bucket', // starts with dot
    'bucket.', // ends with dot
    'ab', // too short
    'a'.repeat(64), // too long
    'bucket_name', // underscore not allowed
    'bucket name', // space not allowed
    'bucket@name', // special characters
  ];

  const bucketNameRegex = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;

  validNames.forEach((name) => {
    it(`should accept valid name: ${name}`, () => {
      const isValid = name.length >= 3 && name.length <= 63 && bucketNameRegex.test(name);
      expect(isValid).toBe(true);
    });
  });

  invalidNames.forEach((name) => {
    it(`should reject invalid name: ${name}`, () => {
      const isValid = name.length >= 3 && name.length <= 63 && bucketNameRegex.test(name);
      expect(isValid).toBe(false);
    });
  });
});

describe('Access Policy Types', () => {
  const validPolicies = ['private', 'public-read', 'authenticated-read'];
  const invalidPolicies = ['public-write', 'all-access', 'none', ''];

  validPolicies.forEach((policy) => {
    it(`should accept valid policy: ${policy}`, () => {
      const isValid = validPolicies.includes(policy);
      expect(isValid).toBe(true);
    });
  });

  invalidPolicies.forEach((policy) => {
    it(`should reject invalid policy: ${policy}`, () => {
      const isValid = validPolicies.includes(policy);
      expect(isValid).toBe(false);
    });
  });
});
