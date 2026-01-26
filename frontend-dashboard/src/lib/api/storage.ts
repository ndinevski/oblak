/**
 * Storage API Client
 * API functions for bucket and object operations
 */

import api from './client';

// =============================================================================
// Types
// =============================================================================

export type BucketPolicy = 'private' | 'public-read' | 'public-read-write';

export interface Bucket {
  id: number;
  name: string;
  policy: BucketPolicy;
  versioning: boolean;
  objectCount: string;
  totalSize: string;
  tags: Record<string, string>;
  description?: string;
  corsConfiguration?: unknown;
  lifecycleRules?: unknown;
  quotaBytes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageObject {
  key: string;
  size: number;
  contentType: string;
  etag: string;
  lastModified: string;
  metadata?: Record<string, string>;
  versionId?: string;
  isDeleteMarker?: boolean;
}

export interface ObjectList {
  objects: StorageObject[];
  prefix?: string;
  delimiter?: string;
  isTruncated: boolean;
  nextMarker?: string;
  commonPrefixes?: string[];
}

export interface BucketStats {
  objectCount: number;
  totalSize: number;
  sizeByContentType: Record<string, number>;
  recentObjects: number;
}

export interface PresignedUrl {
  url: string;
  key: string;
  method: string;
  expiresAt: string;
}

export interface CreateBucketRequest {
  name: string;
  policy?: BucketPolicy;
  versioning?: boolean;
  tags?: Record<string, string>;
  description?: string;
  quotaBytes?: string;
}

export interface UpdateBucketRequest {
  policy?: BucketPolicy;
  versioning?: boolean;
  tags?: Record<string, string>;
  description?: string;
  corsConfiguration?: unknown;
  lifecycleRules?: unknown;
  quotaBytes?: string;
}

export interface UploadObjectRequest {
  key: string;
  data: string; // Base64 encoded
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface CopyObjectRequest {
  sourceKey: string;
  destKey: string;
  sourceBucket?: string;
  metadata?: Record<string, string>;
}

export interface PresignedUrlRequest {
  key: string;
  expiresIn?: number;
  method?: 'GET' | 'PUT';
}

export interface QuotaUsage {
  bucketCount: number;
  totalSize: number;
  limits: {
    maxBucketsPerUser: number;
    maxTotalSizePerUser: number;
  };
}

// =============================================================================
// Bucket API Functions
// =============================================================================

export async function listBuckets(params?: {
  page?: number;
  pageSize?: number;
  sort?: string;
}): Promise<{ data: Bucket[]; meta: { pagination: { total: number; page: number; pageSize: number; pageCount: number } } }> {
  const response = await api.get('/buckets', { params });
  return response.data;
}

export async function getBucket(id: number): Promise<Bucket> {
  const response = await api.get(`/buckets/${id}`);
  return response.data.data;
}

export async function createBucket(data: CreateBucketRequest): Promise<Bucket> {
  const response = await api.post('/buckets', data);
  return response.data.data;
}

export async function updateBucket(id: number, data: UpdateBucketRequest): Promise<Bucket> {
  const response = await api.put(`/buckets/${id}`, data);
  return response.data.data;
}

export async function deleteBucket(id: number, force = false): Promise<{ message: string; name: string }> {
  const response = await api.delete(`/buckets/${id}`, { params: { force: force ? 'true' : undefined } });
  return response.data.data;
}

export async function getBucketStats(id: number): Promise<BucketStats> {
  const response = await api.get(`/buckets/${id}/stats`);
  return response.data.data;
}

export async function syncBucket(id: number): Promise<Bucket> {
  const response = await api.post(`/buckets/${id}/sync`);
  return response.data.data;
}

export async function getQuotaUsage(): Promise<QuotaUsage> {
  const response = await api.get('/buckets/quota');
  return response.data.data;
}

// =============================================================================
// Object API Functions
// =============================================================================

export async function listObjects(
  bucketId: number,
  params?: {
    prefix?: string;
    delimiter?: string;
    marker?: string;
    maxKeys?: number;
  }
): Promise<ObjectList> {
  const response = await api.get(`/buckets/${bucketId}/objects`, { params });
  // Map snake_case to camelCase
  const data = response.data.data;
  return {
    objects: data.objects.map((obj: Record<string, unknown>) => ({
      key: obj.key,
      size: obj.size,
      contentType: obj.content_type,
      etag: obj.etag,
      lastModified: obj.last_modified,
      metadata: obj.metadata,
      versionId: obj.version_id,
      isDeleteMarker: obj.is_delete_marker,
    })),
    prefix: data.prefix,
    delimiter: data.delimiter,
    isTruncated: data.is_truncated,
    nextMarker: data.next_marker,
    commonPrefixes: data.common_prefixes,
  };
}

export async function getObjectInfo(bucketId: number, key: string): Promise<StorageObject> {
  const response = await api.get(`/buckets/${bucketId}/objects/${encodeURIComponent(key)}`, {
    params: { info: 'true' },
  });
  const obj = response.data.data;
  return {
    key: obj.key,
    size: obj.size,
    contentType: obj.content_type,
    etag: obj.etag,
    lastModified: obj.last_modified,
    metadata: obj.metadata,
    versionId: obj.version_id,
    isDeleteMarker: obj.is_delete_marker,
  };
}

export async function downloadObject(bucketId: number, key: string): Promise<Blob> {
  const response = await api.get(`/buckets/${bucketId}/objects/${encodeURIComponent(key)}`, {
    responseType: 'blob',
  });
  return response.data;
}

export async function uploadObject(bucketId: number, data: UploadObjectRequest): Promise<StorageObject> {
  const response = await api.post(`/buckets/${bucketId}/objects`, data);
  const obj = response.data.data;
  return {
    key: obj.key,
    size: obj.size,
    contentType: obj.content_type,
    etag: obj.etag,
    lastModified: obj.last_modified,
    metadata: obj.metadata,
  };
}

export async function deleteObject(bucketId: number, key: string): Promise<{ message: string; key: string }> {
  const response = await api.delete(`/buckets/${bucketId}/objects/${encodeURIComponent(key)}`);
  return response.data.data;
}

export async function deleteObjects(bucketId: number, keys: string[]): Promise<{ deleted: string[]; errors: string[] }> {
  const response = await api.post(`/buckets/${bucketId}/objects/delete-many`, { keys });
  return response.data.data;
}

export async function copyObject(bucketId: number, data: CopyObjectRequest): Promise<StorageObject> {
  const response = await api.post(`/buckets/${bucketId}/objects/copy`, data);
  const obj = response.data.data;
  return {
    key: obj.key,
    size: obj.size,
    contentType: obj.content_type,
    etag: obj.etag,
    lastModified: obj.last_modified,
    metadata: obj.metadata,
  };
}

export async function getPresignedUrl(bucketId: number, data: PresignedUrlRequest): Promise<PresignedUrl> {
  const response = await api.post(`/buckets/${bucketId}/presigned-url`, data);
  const result = response.data.data;
  return {
    url: result.url,
    key: result.key,
    method: result.method,
    expiresAt: result.expires_at,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

export function formatBytes(bytes: number | string, decimals = 2): string {
  const numBytes = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (numBytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(numBytes) / Math.log(k));

  return parseFloat((numBytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function getPolicyLabel(policy: BucketPolicy): string {
  const labels: Record<BucketPolicy, string> = {
    private: 'Private',
    'public-read': 'Public Read',
    'public-read-write': 'Public Read/Write',
  };
  return labels[policy] || policy;
}

export function getPolicyColor(policy: BucketPolicy): string {
  const colors: Record<BucketPolicy, string> = {
    private: 'bg-green-100 text-green-800',
    'public-read': 'bg-yellow-100 text-yellow-800',
    'public-read-write': 'bg-red-100 text-red-800',
  };
  return colors[policy] || 'bg-gray-100 text-gray-800';
}

export function getFileIcon(contentType: string): string {
  if (contentType.startsWith('image/')) return '🖼️';
  if (contentType.startsWith('video/')) return '🎬';
  if (contentType.startsWith('audio/')) return '🎵';
  if (contentType.startsWith('text/')) return '📄';
  if (contentType === 'application/pdf') return '📕';
  if (contentType === 'application/json') return '📋';
  if (contentType.includes('zip') || contentType.includes('tar') || contentType.includes('gz')) return '📦';
  if (contentType.includes('javascript') || contentType.includes('typescript')) return '💻';
  return '📁';
}

export function getExtension(key: string): string {
  const lastDot = key.lastIndexOf('.');
  if (lastDot === -1) return '';
  return key.substring(lastDot + 1).toLowerCase();
}

export function getFileName(key: string): string {
  const lastSlash = key.lastIndexOf('/');
  if (lastSlash === -1) return key;
  return key.substring(lastSlash + 1);
}

export function getParentPath(key: string): string {
  const lastSlash = key.lastIndexOf('/');
  if (lastSlash === -1) return '';
  return key.substring(0, lastSlash + 1);
}

export function isFolder(key: string): boolean {
  return key.endsWith('/');
}

export function joinPath(...parts: string[]): string {
  return parts
    .map((part, index) => {
      if (index === 0) return part.replace(/\/+$/, '');
      return part.replace(/^\/+|\/+$/g, '');
    })
    .filter(Boolean)
    .join('/');
}

export function validateBucketName(name: string): { valid: boolean; error?: string } {
  if (!name) {
    return { valid: false, error: 'Bucket name is required' };
  }
  if (name.length < 3) {
    return { valid: false, error: 'Bucket name must be at least 3 characters' };
  }
  if (name.length > 63) {
    return { valid: false, error: 'Bucket name must be at most 63 characters' };
  }
  const regex = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
  if (!regex.test(name)) {
    return {
      valid: false,
      error: 'Bucket name must start and end with lowercase letter or number, and can only contain lowercase letters, numbers, hyphens, and periods',
    };
  }
  if (name.includes('..')) {
    return { valid: false, error: 'Bucket name cannot contain consecutive periods' };
  }
  return { valid: true };
}

export function getContentType(filename: string): string {
  const ext = getExtension(filename);
  const mimeTypes: Record<string, string> = {
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    xml: 'application/xml',
    pdf: 'application/pdf',
    zip: 'application/zip',
    gz: 'application/gzip',
    tar: 'application/x-tar',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    ico: 'image/x-icon',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    md: 'text/markdown',
    csv: 'text/csv',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export function isPreviewable(contentType: string): boolean {
  return (
    contentType.startsWith('image/') ||
    contentType.startsWith('text/') ||
    contentType === 'application/json' ||
    contentType === 'application/pdf'
  );
}

export function calculateUsagePercentage(used: number | string, limit: number): number {
  const usedBytes = typeof used === 'string' ? parseInt(used, 10) : used;
  if (limit === 0) return 0;
  return Math.min((usedBytes / limit) * 100, 100);
}
