/**
 * Storage API Tests
 */

import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  getPolicyLabel,
  getPolicyColor,
  getFileIcon,
  getExtension,
  getFileName,
  getParentPath,
  isFolder,
  joinPath,
  validateBucketName,
  getContentType,
  isPreviewable,
  calculateUsagePercentage,
} from '@/lib/api/storage';

// =============================================================================
// Bucket Types Tests
// =============================================================================

describe('Bucket Types', () => {
  it('should have correct policy values', () => {
    const policies = ['private', 'public-read', 'public-read-write'];
    expect(policies).toContain('private');
    expect(policies).toContain('public-read');
    expect(policies).toContain('public-read-write');
  });

  it('should represent bucket structure', () => {
    const bucket = {
      id: 1,
      name: 'my-bucket',
      policy: 'private' as const,
      versioning: false,
      objectCount: '100',
      totalSize: '1048576',
      tags: { env: 'test' },
      createdAt: '2025-01-26T00:00:00Z',
      updatedAt: '2025-01-26T00:00:00Z',
    };

    expect(bucket.name).toBe('my-bucket');
    expect(bucket.policy).toBe('private');
    expect(bucket.objectCount).toBe('100');
  });
});

// =============================================================================
// Object Types Tests
// =============================================================================

describe('Object Types', () => {
  it('should represent storage object structure', () => {
    const object = {
      key: 'folder/file.txt',
      size: 1024,
      contentType: 'text/plain',
      etag: '"abc123"',
      lastModified: '2025-01-26T00:00:00Z',
      metadata: { author: 'test' },
    };

    expect(object.key).toBe('folder/file.txt');
    expect(object.size).toBe(1024);
    expect(object.contentType).toBe('text/plain');
  });

  it('should represent object list with pagination', () => {
    const objectList = {
      objects: [{ key: 'file.txt', size: 100 }],
      prefix: '',
      delimiter: '/',
      isTruncated: false,
      commonPrefixes: ['folder1/', 'folder2/'],
    };

    expect(objectList.isTruncated).toBe(false);
    expect(objectList.commonPrefixes).toHaveLength(2);
  });
});

// =============================================================================
// formatBytes Tests
// =============================================================================

describe('formatBytes', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(100)).toBe('100 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1073741824)).toBe('1 GB');
    expect(formatBytes(1099511627776)).toBe('1 TB');
  });

  it('should handle string input', () => {
    expect(formatBytes('1024')).toBe('1 KB');
    expect(formatBytes('1048576')).toBe('1 MB');
  });

  it('should respect decimals parameter', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
    expect(formatBytes(1536, 1)).toBe('1.5 KB');
    expect(formatBytes(1536, 2)).toBe('1.5 KB');
  });
});

// =============================================================================
// Policy Helper Tests
// =============================================================================

describe('Policy Helpers', () => {
  describe('getPolicyLabel', () => {
    it('should return correct labels', () => {
      expect(getPolicyLabel('private')).toBe('Private');
      expect(getPolicyLabel('public-read')).toBe('Public Read');
      expect(getPolicyLabel('public-read-write')).toBe('Public Read/Write');
    });
  });

  describe('getPolicyColor', () => {
    it('should return correct colors', () => {
      expect(getPolicyColor('private')).toContain('green');
      expect(getPolicyColor('public-read')).toContain('yellow');
      expect(getPolicyColor('public-read-write')).toContain('red');
    });
  });
});

// =============================================================================
// File Helper Tests
// =============================================================================

describe('File Helpers', () => {
  describe('getFileIcon', () => {
    it('should return correct icons for content types', () => {
      expect(getFileIcon('image/png')).toBe('🖼️');
      expect(getFileIcon('video/mp4')).toBe('🎬');
      expect(getFileIcon('audio/mpeg')).toBe('🎵');
      expect(getFileIcon('text/plain')).toBe('📄');
      expect(getFileIcon('application/pdf')).toBe('📕');
      expect(getFileIcon('application/json')).toBe('📋');
      expect(getFileIcon('application/zip')).toBe('📦');
      expect(getFileIcon('application/javascript')).toBe('💻');
      expect(getFileIcon('application/octet-stream')).toBe('📁');
    });
  });

  describe('getExtension', () => {
    it('should extract file extensions', () => {
      expect(getExtension('file.txt')).toBe('txt');
      expect(getExtension('file.TAR.GZ')).toBe('gz');
      expect(getExtension('noextension')).toBe('');
      expect(getExtension('path/to/file.pdf')).toBe('pdf');
    });
  });

  describe('getFileName', () => {
    it('should extract file names from paths', () => {
      expect(getFileName('file.txt')).toBe('file.txt');
      expect(getFileName('folder/file.txt')).toBe('file.txt');
      expect(getFileName('a/b/c/file.txt')).toBe('file.txt');
    });
  });

  describe('getParentPath', () => {
    it('should extract parent paths', () => {
      expect(getParentPath('file.txt')).toBe('');
      expect(getParentPath('folder/file.txt')).toBe('folder/');
      expect(getParentPath('a/b/c/file.txt')).toBe('a/b/c/');
    });
  });

  describe('isFolder', () => {
    it('should detect folder keys', () => {
      expect(isFolder('folder/')).toBe(true);
      expect(isFolder('a/b/c/')).toBe(true);
      expect(isFolder('file.txt')).toBe(false);
      expect(isFolder('folder/file.txt')).toBe(false);
    });
  });

  describe('joinPath', () => {
    it('should join path parts correctly', () => {
      expect(joinPath('a', 'b', 'c')).toBe('a/b/c');
      expect(joinPath('a/', '/b/', '/c')).toBe('a/b/c');
      expect(joinPath('folder', 'file.txt')).toBe('folder/file.txt');
    });
  });
});

// =============================================================================
// Bucket Name Validation Tests
// =============================================================================

describe('validateBucketName', () => {
  it('should accept valid bucket names', () => {
    expect(validateBucketName('my-bucket').valid).toBe(true);
    expect(validateBucketName('bucket123').valid).toBe(true);
    expect(validateBucketName('a.b.c').valid).toBe(true);
    expect(validateBucketName('abc').valid).toBe(true);
  });

  it('should reject empty names', () => {
    const result = validateBucketName('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  it('should reject names that are too short', () => {
    const result = validateBucketName('ab');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 3');
  });

  it('should reject names that are too long', () => {
    const result = validateBucketName('a'.repeat(64));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at most 63');
  });

  it('should reject names with uppercase letters', () => {
    const result = validateBucketName('MyBucket');
    expect(result.valid).toBe(false);
  });

  it('should reject names starting with hyphen', () => {
    const result = validateBucketName('-bucket');
    expect(result.valid).toBe(false);
  });

  it('should reject names with consecutive periods', () => {
    const result = validateBucketName('bucket..name');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('consecutive periods');
  });
});

// =============================================================================
// Content Type Tests
// =============================================================================

describe('getContentType', () => {
  it('should return correct MIME types', () => {
    expect(getContentType('file.txt')).toBe('text/plain');
    expect(getContentType('file.json')).toBe('application/json');
    expect(getContentType('file.html')).toBe('text/html');
    expect(getContentType('file.css')).toBe('text/css');
    expect(getContentType('file.js')).toBe('application/javascript');
    expect(getContentType('file.png')).toBe('image/png');
    expect(getContentType('file.jpg')).toBe('image/jpeg');
    expect(getContentType('file.pdf')).toBe('application/pdf');
    expect(getContentType('file.zip')).toBe('application/zip');
  });

  it('should return octet-stream for unknown types', () => {
    expect(getContentType('file.xyz')).toBe('application/octet-stream');
    expect(getContentType('file.unknown')).toBe('application/octet-stream');
  });
});

// =============================================================================
// Preview Tests
// =============================================================================

describe('isPreviewable', () => {
  it('should return true for previewable types', () => {
    expect(isPreviewable('image/png')).toBe(true);
    expect(isPreviewable('image/jpeg')).toBe(true);
    expect(isPreviewable('text/plain')).toBe(true);
    expect(isPreviewable('text/html')).toBe(true);
    expect(isPreviewable('application/json')).toBe(true);
    expect(isPreviewable('application/pdf')).toBe(true);
  });

  it('should return false for non-previewable types', () => {
    expect(isPreviewable('application/zip')).toBe(false);
    expect(isPreviewable('application/octet-stream')).toBe(false);
    expect(isPreviewable('video/mp4')).toBe(false);
  });
});

// =============================================================================
// Usage Calculation Tests
// =============================================================================

describe('calculateUsagePercentage', () => {
  it('should calculate percentage correctly', () => {
    expect(calculateUsagePercentage(50, 100)).toBe(50);
    expect(calculateUsagePercentage(25, 100)).toBe(25);
    expect(calculateUsagePercentage(100, 100)).toBe(100);
  });

  it('should handle string input', () => {
    expect(calculateUsagePercentage('50', 100)).toBe(50);
    expect(calculateUsagePercentage('1073741824', 10737418240)).toBeCloseTo(10);
  });

  it('should cap at 100%', () => {
    expect(calculateUsagePercentage(150, 100)).toBe(100);
  });

  it('should handle zero limit', () => {
    expect(calculateUsagePercentage(50, 0)).toBe(0);
  });
});

// =============================================================================
// Integration Scenarios
// =============================================================================

describe('Storage Integration Scenarios', () => {
  describe('Bucket Creation', () => {
    it('should validate bucket creation data', () => {
      const createRequest = {
        name: 'my-new-bucket',
        policy: 'private' as const,
        versioning: false,
        tags: { environment: 'production' },
      };

      expect(validateBucketName(createRequest.name).valid).toBe(true);
      expect(createRequest.policy).toBe('private');
    });
  });

  describe('Object Upload', () => {
    it('should prepare upload data correctly', () => {
      const uploadRequest = {
        key: 'documents/report.pdf',
        data: 'base64encodeddata',
        contentType: 'application/pdf',
        metadata: { author: 'John' },
      };

      expect(getParentPath(uploadRequest.key)).toBe('documents/');
      expect(getFileName(uploadRequest.key)).toBe('report.pdf');
    });
  });

  describe('Folder Navigation', () => {
    it('should build breadcrumbs correctly', () => {
      const prefix = 'level1/level2/level3/';
      const parts = prefix.split('/').filter(Boolean);
      const breadcrumbs = parts.map((part, i) => ({
        name: part,
        path: parts.slice(0, i + 1).join('/') + '/',
      }));

      expect(breadcrumbs).toHaveLength(3);
      expect(breadcrumbs[0].path).toBe('level1/');
      expect(breadcrumbs[1].path).toBe('level1/level2/');
      expect(breadcrumbs[2].path).toBe('level1/level2/level3/');
    });
  });
});

// =============================================================================
// API Response Mapping Tests
// =============================================================================

describe('API Response Mapping', () => {
  it('should map snake_case object to camelCase', () => {
    const apiResponse = {
      key: 'file.txt',
      size: 1024,
      content_type: 'text/plain',
      etag: '"abc"',
      last_modified: '2025-01-26T00:00:00Z',
      version_id: 'v1',
      is_delete_marker: false,
    };

    const mapped = {
      key: apiResponse.key,
      size: apiResponse.size,
      contentType: apiResponse.content_type,
      etag: apiResponse.etag,
      lastModified: apiResponse.last_modified,
      versionId: apiResponse.version_id,
      isDeleteMarker: apiResponse.is_delete_marker,
    };

    expect(mapped.contentType).toBe('text/plain');
    expect(mapped.lastModified).toBe('2025-01-26T00:00:00Z');
    expect(mapped.versionId).toBe('v1');
  });

  it('should map object list response', () => {
    const apiResponse = {
      objects: [],
      prefix: 'folder/',
      delimiter: '/',
      is_truncated: true,
      next_marker: 'file100.txt',
      common_prefixes: ['subfolder1/', 'subfolder2/'],
    };

    const mapped = {
      objects: apiResponse.objects,
      prefix: apiResponse.prefix,
      delimiter: apiResponse.delimiter,
      isTruncated: apiResponse.is_truncated,
      nextMarker: apiResponse.next_marker,
      commonPrefixes: apiResponse.common_prefixes,
    };

    expect(mapped.isTruncated).toBe(true);
    expect(mapped.commonPrefixes).toHaveLength(2);
  });
});
