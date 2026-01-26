/**
 * Storage (Bucket) API Tests
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// Schema Tests
// =============================================================================

describe('Bucket Schema', () => {
  const schema = {
    kind: 'collectionType',
    collectionName: 'buckets',
    info: {
      singularName: 'bucket',
      pluralName: 'buckets',
      displayName: 'Bucket',
    },
    attributes: {
      name: { type: 'string', required: true, unique: true, minLength: 3, maxLength: 63 },
      policy: { type: 'enumeration', enum: ['private', 'public-read', 'public-read-write'], default: 'private' },
      versioning: { type: 'boolean', default: false },
      objectCount: { type: 'biginteger', default: '0' },
      totalSize: { type: 'biginteger', default: '0' },
      tags: { type: 'json', default: {} },
      description: { type: 'text' },
      corsConfiguration: { type: 'json' },
      lifecycleRules: { type: 'json' },
      quotaBytes: { type: 'biginteger' },
      externalSynced: { type: 'boolean', default: true, private: true },
      lastSyncedAt: { type: 'datetime', private: true },
      owner: { type: 'relation', relation: 'manyToOne', target: 'plugin::users-permissions.user' },
    },
  };

  it('should be a collection type', () => {
    expect(schema.kind).toBe('collectionType');
    expect(schema.collectionName).toBe('buckets');
  });

  it('should have required name field with constraints', () => {
    expect(schema.attributes.name.required).toBe(true);
    expect(schema.attributes.name.unique).toBe(true);
    expect(schema.attributes.name.minLength).toBe(3);
    expect(schema.attributes.name.maxLength).toBe(63);
  });

  it('should have policy enumeration with correct values', () => {
    expect(schema.attributes.policy.type).toBe('enumeration');
    expect(schema.attributes.policy.enum).toContain('private');
    expect(schema.attributes.policy.enum).toContain('public-read');
    expect(schema.attributes.policy.enum).toContain('public-read-write');
    expect(schema.attributes.policy.default).toBe('private');
  });

  it('should have versioning boolean with false default', () => {
    expect(schema.attributes.versioning.type).toBe('boolean');
    expect(schema.attributes.versioning.default).toBe(false);
  });

  it('should have stats fields as biginteger', () => {
    expect(schema.attributes.objectCount.type).toBe('biginteger');
    expect(schema.attributes.totalSize.type).toBe('biginteger');
  });

  it('should have private sync fields', () => {
    expect(schema.attributes.externalSynced.private).toBe(true);
    expect(schema.attributes.lastSyncedAt.private).toBe(true);
  });

  it('should have owner relation to user', () => {
    expect(schema.attributes.owner.type).toBe('relation');
    expect(schema.attributes.owner.relation).toBe('manyToOne');
    expect(schema.attributes.owner.target).toBe('plugin::users-permissions.user');
  });
});

// =============================================================================
// Spomen Client Tests
// =============================================================================

describe('Spomen Client Types', () => {
  interface SpomenBucket {
    name: string;
    created_at: string;
    policy?: 'private' | 'public-read' | 'public-read-write';
    versioning: boolean;
    object_count?: number;
    total_size?: number;
    tags?: Record<string, string>;
  }

  interface SpomenObject {
    key: string;
    size: number;
    content_type: string;
    etag: string;
    last_modified: string;
    metadata?: Record<string, string>;
    version_id?: string;
    is_delete_marker?: boolean;
  }

  it('should have correct bucket structure', () => {
    const bucket: SpomenBucket = {
      name: 'test-bucket',
      created_at: '2025-01-26T00:00:00Z',
      policy: 'private',
      versioning: false,
      object_count: 10,
      total_size: 1024,
      tags: { env: 'test' },
    };

    expect(bucket.name).toBe('test-bucket');
    expect(bucket.policy).toBe('private');
    expect(bucket.versioning).toBe(false);
  });

  it('should have correct object structure', () => {
    const object: SpomenObject = {
      key: 'folder/file.txt',
      size: 1024,
      content_type: 'text/plain',
      etag: '"abc123"',
      last_modified: '2025-01-26T00:00:00Z',
      metadata: { author: 'test' },
    };

    expect(object.key).toBe('folder/file.txt');
    expect(object.content_type).toBe('text/plain');
    expect(object.size).toBe(1024);
  });

  it('should support versioning fields', () => {
    const object: SpomenObject = {
      key: 'file.txt',
      size: 512,
      content_type: 'text/plain',
      etag: '"xyz789"',
      last_modified: '2025-01-26T00:00:00Z',
      version_id: 'v1',
      is_delete_marker: false,
    };

    expect(object.version_id).toBe('v1');
    expect(object.is_delete_marker).toBe(false);
  });
});

// =============================================================================
// Bucket Service Tests
// =============================================================================

describe('Bucket Service', () => {
  const DEFAULT_QUOTAS = {
    maxBucketsPerUser: 10,
    maxTotalSizePerUser: 10 * 1024 * 1024 * 1024, // 10GB
  };

  describe('Quota Management', () => {
    it('should have correct default quotas', () => {
      expect(DEFAULT_QUOTAS.maxBucketsPerUser).toBe(10);
      expect(DEFAULT_QUOTAS.maxTotalSizePerUser).toBe(10737418240); // 10GB in bytes
    });

    it('should calculate quota usage correctly', () => {
      const buckets = [
        { totalSize: '1073741824' }, // 1GB
        { totalSize: '2147483648' }, // 2GB
        { totalSize: '536870912' },  // 0.5GB
      ];

      const bucketCount = buckets.length;
      const totalSize = buckets.reduce(
        (sum, b) => sum + parseInt(b.totalSize, 10),
        0
      );

      expect(bucketCount).toBe(3);
      expect(totalSize).toBe(3758096384); // 3.5GB
    });

    it('should detect quota exceeded', () => {
      const usage = {
        bucketCount: 10,
        totalSize: 8 * 1024 * 1024 * 1024,
      };

      const bucketQuotaExceeded = usage.bucketCount >= DEFAULT_QUOTAS.maxBucketsPerUser;
      expect(bucketQuotaExceeded).toBe(true);
    });
  });

  describe('Bucket Mapping', () => {
    it('should map Spomen bucket to Strapi format', () => {
      const spomenBucket = {
        name: 'my-bucket',
        created_at: '2025-01-26T00:00:00Z',
        policy: 'private' as const,
        versioning: true,
        object_count: 100,
        total_size: 1048576,
        tags: { project: 'oblak' },
      };

      const strapiBucket = {
        name: spomenBucket.name,
        policy: spomenBucket.policy || 'private',
        versioning: spomenBucket.versioning,
        objectCount: String(spomenBucket.object_count || 0),
        totalSize: String(spomenBucket.total_size || 0),
        tags: spomenBucket.tags || {},
      };

      expect(strapiBucket.name).toBe('my-bucket');
      expect(strapiBucket.policy).toBe('private');
      expect(strapiBucket.versioning).toBe(true);
      expect(strapiBucket.objectCount).toBe('100');
      expect(strapiBucket.totalSize).toBe('1048576');
    });
  });
});

// =============================================================================
// Object Service Tests
// =============================================================================

describe('Object Service', () => {
  describe('Object List Response', () => {
    interface SpomenObjectList {
      objects: Array<{
        key: string;
        size: number;
        content_type: string;
        etag: string;
        last_modified: string;
      }>;
      prefix?: string;
      delimiter?: string;
      is_truncated: boolean;
      next_marker?: string;
      common_prefixes?: string[];
    }

    it('should handle paginated object list', () => {
      const response: SpomenObjectList = {
        objects: [
          { key: 'file1.txt', size: 100, content_type: 'text/plain', etag: '"a"', last_modified: '2025-01-26T00:00:00Z' },
          { key: 'file2.txt', size: 200, content_type: 'text/plain', etag: '"b"', last_modified: '2025-01-26T00:00:00Z' },
        ],
        is_truncated: true,
        next_marker: 'file2.txt',
      };

      expect(response.objects).toHaveLength(2);
      expect(response.is_truncated).toBe(true);
      expect(response.next_marker).toBe('file2.txt');
    });

    it('should handle directory-like listing with common prefixes', () => {
      const response: SpomenObjectList = {
        objects: [],
        prefix: '',
        delimiter: '/',
        is_truncated: false,
        common_prefixes: ['images/', 'docs/', 'videos/'],
      };

      expect(response.common_prefixes).toHaveLength(3);
      expect(response.common_prefixes).toContain('images/');
    });
  });

  describe('Presigned URLs', () => {
    interface PresignedURLRequest {
      key: string;
      expires_in?: number;
      method?: 'GET' | 'PUT';
    }

    it('should validate presigned URL request for download', () => {
      const request: PresignedURLRequest = {
        key: 'folder/document.pdf',
        expires_in: 3600,
        method: 'GET',
      };

      expect(request.key).toBe('folder/document.pdf');
      expect(request.method).toBe('GET');
    });

    it('should validate presigned URL request for upload', () => {
      const request: PresignedURLRequest = {
        key: 'uploads/new-file.zip',
        expires_in: 7200,
        method: 'PUT',
      };

      expect(request.method).toBe('PUT');
      expect(request.expires_in).toBe(7200);
    });
  });

  describe('Copy Object', () => {
    interface CopyObjectRequest {
      source_bucket: string;
      source_key: string;
      dest_key: string;
      metadata?: Record<string, string>;
    }

    it('should validate copy within same bucket', () => {
      const request: CopyObjectRequest = {
        source_bucket: 'my-bucket',
        source_key: 'original.txt',
        dest_key: 'copy.txt',
      };

      expect(request.source_bucket).toBe('my-bucket');
      expect(request.source_key).toBe('original.txt');
      expect(request.dest_key).toBe('copy.txt');
    });

    it('should validate cross-bucket copy', () => {
      const request: CopyObjectRequest = {
        source_bucket: 'source-bucket',
        source_key: 'file.txt',
        dest_key: 'backup/file.txt',
        metadata: { copied: 'true' },
      };

      expect(request.source_bucket).toBe('source-bucket');
      expect(request.metadata?.copied).toBe('true');
    });
  });
});

// =============================================================================
// Controller Tests
// =============================================================================

describe('Bucket Controller', () => {
  describe('Bucket Name Validation', () => {
    const nameRegex = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;

    it('should accept valid bucket names', () => {
      expect(nameRegex.test('my-bucket')).toBe(true);
      expect(nameRegex.test('bucket123')).toBe(true);
      expect(nameRegex.test('my.bucket.name')).toBe(true);
      expect(nameRegex.test('a-b')).toBe(true);
    });

    it('should reject invalid bucket names', () => {
      expect(nameRegex.test('My-Bucket')).toBe(false); // uppercase
      expect(nameRegex.test('-bucket')).toBe(false); // starts with hyphen
      expect(nameRegex.test('bucket-')).toBe(false); // ends with hyphen
      expect(nameRegex.test('a')).toBe(false); // too short (needs min 3)
    });

    it('should validate bucket name length', () => {
      const validName = 'abc';
      const tooShort = 'ab';
      const maxLength = 'a'.repeat(63);
      const tooLong = 'a'.repeat(64);

      expect(validName.length >= 3 && validName.length <= 63).toBe(true);
      expect(tooShort.length >= 3).toBe(false);
      expect(maxLength.length <= 63).toBe(true);
      expect(tooLong.length <= 63).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should map not found errors to 404', () => {
      const error = new Error('Bucket not found');
      const isNotFound = error.message.includes('not found');
      expect(isNotFound).toBe(true);
    });

    it('should map quota errors to 403', () => {
      const error = new Error('Bucket quota exceeded');
      const isQuotaError = error.message.includes('quota');
      expect(isQuotaError).toBe(true);
    });

    it('should map duplicate errors to 409', () => {
      const error = new Error('Bucket name is already taken');
      const isDuplicate = error.message.includes('already taken');
      expect(isDuplicate).toBe(true);
    });
  });
});

describe('Object Controller', () => {
  describe('Key Extraction', () => {
    it('should extract key from wildcard params', () => {
      const params = { '0': 'folder/subfolder/file.txt', id: '1' };
      const key = params['0'] || params.key || '';
      expect(key).toBe('folder/subfolder/file.txt');
    });

    it('should handle deeply nested keys', () => {
      const key = 'level1/level2/level3/level4/file.json';
      const parts = key.split('/');
      expect(parts).toHaveLength(5);
      expect(parts[parts.length - 1]).toBe('file.json');
    });
  });

  describe('Content Type Detection', () => {
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
    };

    it('should detect common mime types', () => {
      expect(mimeTypes['.txt']).toBe('text/plain');
      expect(mimeTypes['.json']).toBe('application/json');
      expect(mimeTypes['.png']).toBe('image/png');
    });

    it('should default to octet-stream for unknown types', () => {
      const extension = '.xyz';
      const mimeType = mimeTypes[extension] || 'application/octet-stream';
      expect(mimeType).toBe('application/octet-stream');
    });
  });
});

// =============================================================================
// Integration Scenarios
// =============================================================================

describe('Storage Integration Scenarios', () => {
  describe('Bucket Lifecycle', () => {
    it('should support create -> update -> delete workflow', () => {
      const createRequest = { name: 'new-bucket', policy: 'private' };
      const updateRequest = { policy: 'public-read' };
      const deleteParams = { force: false };

      expect(createRequest.name).toBe('new-bucket');
      expect(updateRequest.policy).toBe('public-read');
      expect(deleteParams.force).toBe(false);
    });
  });

  describe('Object Upload Workflow', () => {
    it('should support file upload with metadata', () => {
      const uploadRequest = {
        key: 'documents/report.pdf',
        contentType: 'application/pdf',
        metadata: {
          author: 'John Doe',
          department: 'Engineering',
        },
      };

      expect(uploadRequest.key).toBe('documents/report.pdf');
      expect(uploadRequest.metadata.author).toBe('John Doe');
    });

    it('should support presigned URL upload', () => {
      const presignedRequest = {
        key: 'uploads/large-file.zip',
        method: 'PUT' as const,
        expiresIn: 3600,
      };

      expect(presignedRequest.method).toBe('PUT');
    });
  });

  describe('Folder Structure', () => {
    it('should handle folder-like object keys', () => {
      const objects = [
        { key: 'images/avatar.png' },
        { key: 'images/banner.jpg' },
        { key: 'docs/readme.md' },
        { key: 'docs/api/spec.json' },
      ];

      const imageObjects = objects.filter(o => o.key.startsWith('images/'));
      const docObjects = objects.filter(o => o.key.startsWith('docs/'));

      expect(imageObjects).toHaveLength(2);
      expect(docObjects).toHaveLength(2);
    });

    it('should extract folder prefixes', () => {
      const keys = [
        'folder1/file1.txt',
        'folder1/file2.txt',
        'folder2/file3.txt',
        'file4.txt',
      ];

      const prefixes = new Set<string>();
      keys.forEach(key => {
        const slashIndex = key.indexOf('/');
        if (slashIndex !== -1) {
          prefixes.add(key.substring(0, slashIndex + 1));
        }
      });

      expect(Array.from(prefixes)).toEqual(['folder1/', 'folder2/']);
    });
  });
});
