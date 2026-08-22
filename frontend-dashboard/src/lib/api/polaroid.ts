/**
 * Polaroid API Client
 * API functions for photo management operations
 */

import { api, apiClient, API_CONFIG } from './client';
import axios from 'axios';

// =============================================================================
// Types
// =============================================================================

export interface PolaroidAsset {
  id: string;
  deviceAssetId: string;
  ownerId: string;
  deviceId: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  originalPath: string;
  originalFileName: string;
  originalMimeType: string;
  fileCreatedAt: string;
  fileModifiedAt: string;
  localDateTime: string;
  updatedAt: string;
  isFavorite: boolean;
  isArchived: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isTrashed: boolean;
  duration: string;
  exifInfo?: PolaroidExifInfo;
  smartInfo?: { tags?: string[]; objects?: string[] };
  livePhotoVideoId?: string | null;
  tags?: PolaroidTag[];
  people?: PolaroidPersonInAsset[];
  checksum: string;
  thumbhash: string | null;
}

export interface PolaroidExifInfo {
  make?: string | null;
  model?: string | null;
  exifImageWidth?: number | null;
  exifImageHeight?: number | null;
  fileSizeInByte?: number | null;
  orientation?: string | null;
  dateTimeOriginal?: string | null;
  modifyDate?: string | null;
  timeZone?: string | null;
  lensModel?: string | null;
  fNumber?: number | null;
  focalLength?: number | null;
  iso?: number | null;
  exposureTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  description?: string | null;
}

export interface PolaroidAlbum {
  id: string;
  albumName: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  albumThumbnailAssetId: string | null;
  shared: boolean;
  hasSharedLink: boolean;
  startDate: string | null;
  endDate: string | null;
  assets?: PolaroidAsset[];
  assetCount: number;
  owner: { id: string; email: string; name: string };
  sharedUsers?: { id: string; email: string; name: string }[];
}

export interface PolaroidPerson {
  id: string;
  name: string;
  birthDate: string | null;
  thumbnailPath: string;
  isHidden: boolean;
}

export interface PolaroidPersonInAsset {
  id: string;
  name: string;
}

export interface PolaroidSearchResult {
  assets: { items: PolaroidAsset[]; total: number; count: number; nextPage: string | null };
}

export interface PolaroidMapMarker {
  id: string;
  lat: number;
  lon: number;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface PolaroidSharedLink {
  id: string;
  description: string | null;
  password: string | null;
  key: string;
  type: 'ALBUM' | 'INDIVIDUAL';
  createdAt: string;
  expiresAt: string | null;
  assets: PolaroidAsset[];
  album?: PolaroidAlbum;
  allowUpload: boolean;
  allowDownload: boolean;
  showMetadata: boolean;
}

export interface PolaroidTag {
  id: string;
  name: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolaroidApiKey {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolaroidServerInfo {
  photos: number;
  videos: number;
  usage: number;
  usageByUser: {
    userId: string;
    userName: string;
    photos: number;
    videos: number;
    usage: number;
    quotaSizeInBytes: number | null;
  }[];
}

export interface PolaroidAssetStatistics {
  images: number;
  videos: number;
  total: number;
}

export interface PolaroidTimeBucket {
  timeBucket: string;
  count: number;
}

// =============================================================================
// Server API Functions
// =============================================================================

export async function getServerInfo(): Promise<PolaroidServerInfo> {
  return api.get('/polaroid/server/info');
}

export async function pingServer(): Promise<{ res: string }> {
  return api.get('/polaroid/server/ping');
}

// =============================================================================
// Asset API Functions
// =============================================================================

export async function getAssets(params?: {
  skip?: number;
  take?: number;
  order?: 'asc' | 'desc';
  isFavorite?: boolean;
  isArchived?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isTrashed?: boolean;
}): Promise<PolaroidAsset[]> {
  return api.get('/polaroid/assets', { params });
}

export async function getAsset(assetId: string): Promise<PolaroidAsset> {
  return api.get(`/polaroid/assets/${assetId}`);
}

export async function getAssetStatistics(): Promise<PolaroidAssetStatistics> {
  return api.get('/polaroid/assets/statistics');
}

export async function uploadAsset(formData: FormData): Promise<PolaroidAsset> {
  const response = await apiClient.post<PolaroidAsset>('/polaroid/assets/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function updateAsset(
  assetId: string,
  data: { isFavorite?: boolean; isArchived?: boolean; visibility?: 'timeline' | 'archive' | 'hidden'; description?: string; rating?: number }
): Promise<PolaroidAsset> {
  return api.put(`/polaroid/assets/${assetId}`, data);
}

export async function deleteAssets(ids: string[], force?: boolean): Promise<void> {
  return api.post('/polaroid/assets/delete', { ids, force });
}

export async function checkExistingAssets(
  deviceAssetIds: string[],
  deviceId: string
): Promise<{ existingIds: string[] }> {
  return api.post('/polaroid/assets/exist', { deviceAssetIds, deviceId });
}

export function getAssetThumbnailUrl(assetId: string, size?: string): string {
  return `${API_CONFIG.baseURL}/polaroid/assets/${assetId}/thumbnail?size=${size || 'preview'}`;
}

export async function fetchAssetThumbnail(assetId: string, size?: string): Promise<Blob> {
  const response = await apiClient.get(`/polaroid/assets/${assetId}/thumbnail`, {
    params: { size: size || 'preview' },
    responseType: 'blob',
  });
  return response.data;
}

export async function fetchPersonThumbnail(personId: string): Promise<Blob> {
  const response = await apiClient.get(`/polaroid/people/${personId}/thumbnail`, {
    responseType: 'blob',
  });
  return response.data;
}

export async function downloadAsset(assetId: string): Promise<Blob> {
  const response = await apiClient.get(`/polaroid/assets/${assetId}/original`, {
    responseType: 'blob',
  });
  return response.data;
}

// =============================================================================
// Timeline API Functions
// =============================================================================

export async function getTimeBuckets(params: {
  size?: string;
  userId?: string;
  albumId?: string;
  personId?: string;
  isArchived?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isFavorite?: boolean;
  isTrashed?: boolean;
  withStacked?: boolean;
}): Promise<PolaroidTimeBucket[]> {
  return api.get('/polaroid/timeline/buckets', { params });
}

export async function getTimeBucket(params: {
  size?: string;
  timeBucket: string;
  userId?: string;
  albumId?: string;
  personId?: string;
  isArchived?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isFavorite?: boolean;
  isTrashed?: boolean;
  withStacked?: boolean;
}): Promise<PolaroidAsset[]> {
  return api.get('/polaroid/timeline/bucket', { params });
}

// =============================================================================
// Album API Functions
// =============================================================================

export async function getAlbums(shared?: boolean): Promise<PolaroidAlbum[]> {
  return api.get('/polaroid/albums', { params: shared !== undefined ? { shared } : undefined });
}

export async function getAlbum(albumId: string): Promise<PolaroidAlbum> {
  return api.get(`/polaroid/albums/${albumId}`);
}

export async function createAlbum(data: {
  albumName: string;
  description?: string;
  assetIds?: string[];
  sharedUserIds?: string[];
}): Promise<PolaroidAlbum> {
  return api.post('/polaroid/albums', data);
}

export async function updateAlbum(
  albumId: string,
  data: { albumName?: string; description?: string; albumThumbnailAssetId?: string }
): Promise<PolaroidAlbum> {
  return api.patch(`/polaroid/albums/${albumId}`, data);
}

export async function deleteAlbum(albumId: string): Promise<void> {
  return api.delete(`/polaroid/albums/${albumId}`);
}

export async function addAssetsToAlbum(
  albumId: string,
  assetIds: string[]
): Promise<{ id: string; success: boolean; error?: string }[]> {
  return api.put(`/polaroid/albums/${albumId}/assets`, { ids: assetIds });
}

export async function removeAssetsFromAlbum(
  albumId: string,
  assetIds: string[]
): Promise<{ id: string; success: boolean; error?: string }[]> {
  return api.delete(`/polaroid/albums/${albumId}/assets`, { data: { ids: assetIds } });
}

// =============================================================================
// People API Functions
// =============================================================================

export async function getPeople(params?: {
  withHidden?: boolean;
  page?: number;
  size?: number;
}): Promise<{ people: PolaroidPerson[]; total: number; hasNextPage: boolean }> {
  return api.get('/polaroid/people', { params });
}

export async function getPerson(personId: string): Promise<PolaroidPerson> {
  return api.get(`/polaroid/people/${personId}`);
}

export async function updatePerson(
  personId: string,
  data: { name?: string; birthDate?: string | null; isHidden?: boolean; featureFaceAssetId?: string }
): Promise<PolaroidPerson> {
  return api.put(`/polaroid/people/${personId}`, data);
}

export function getPersonThumbnailUrl(personId: string): string {
  return `${API_CONFIG.baseURL}/polaroid/people/${personId}/thumbnail`;
}

export async function mergePeople(
  personId: string,
  mergeIds: string[]
): Promise<{ id: string; success: boolean; error?: string }[]> {
  return api.post(`/polaroid/people/${personId}/merge`, { ids: mergeIds });
}

// =============================================================================
// Search API Functions
// =============================================================================

export async function searchMetadata(query: {
  city?: string;
  country?: string;
  createdAfter?: string;
  createdBefore?: string;
  deviceId?: string;
  isArchived?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isFavorite?: boolean;
  isTrashed?: boolean;
  make?: string;
  model?: string;
  originalFileName?: string;
  page?: number;
  size?: number;
  state?: string;
  takenAfter?: string;
  takenBefore?: string;
  type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  withArchived?: boolean;
  withExif?: boolean;
  withPeople?: boolean;
}): Promise<PolaroidSearchResult> {
  return api.post('/polaroid/search/metadata', query);
}

export async function searchSmart(
  query: string,
  params?: {
    city?: string;
    country?: string;
    isArchived?: boolean;
    visibility?: 'timeline' | 'archive' | 'hidden';
    isFavorite?: boolean;
    page?: number;
    size?: number;
    state?: string;
    type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
    withArchived?: boolean;
  }
): Promise<PolaroidSearchResult> {
  return api.post('/polaroid/search/smart', { query, ...params });
}

// =============================================================================
// Map API Functions
// =============================================================================

export async function getMapMarkers(params?: {
  isArchived?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isFavorite?: boolean;
  fileCreatedAfter?: string;
  fileCreatedBefore?: string;
  withPartners?: boolean;
}): Promise<PolaroidMapMarker[]> {
  return api.get('/polaroid/map/markers', { params });
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ city: string | null; state: string | null; country: string | null }> {
  return api.get('/polaroid/map/reverse-geocode', { params: { lat, lng } });
}

// =============================================================================
// Shared Links API Functions
// =============================================================================

export async function getSharedLinks(): Promise<PolaroidSharedLink[]> {
  return api.get('/polaroid/shared-links');
}

export async function getSharedLink(linkId: string): Promise<PolaroidSharedLink> {
  return api.get(`/polaroid/shared-links/${linkId}`);
}

export async function createSharedLink(data: {
  type: 'ALBUM' | 'INDIVIDUAL';
  albumId?: string;
  assetIds?: string[];
  allowDownload?: boolean;
  allowUpload?: boolean;
  description?: string;
  expiresAt?: string | null;
  password?: string;
  showMetadata?: boolean;
}): Promise<PolaroidSharedLink> {
  return api.post('/polaroid/shared-links', data);
}

export async function updateSharedLink(
  linkId: string,
  data: {
    allowDownload?: boolean;
    allowUpload?: boolean;
    description?: string | null;
    expiresAt?: string | null;
    password?: string | null;
    showMetadata?: boolean;
  }
): Promise<PolaroidSharedLink> {
  return api.patch(`/polaroid/shared-links/${linkId}`, data);
}

export async function deleteSharedLink(linkId: string): Promise<void> {
  return api.delete(`/polaroid/shared-links/${linkId}`);
}

// =============================================================================
// Tags API Functions
// =============================================================================

export async function getTags(): Promise<PolaroidTag[]> {
  return api.get('/polaroid/tags');
}

export async function createTag(data: { name: string; value?: string }): Promise<PolaroidTag> {
  return api.post('/polaroid/tags', data);
}

export async function updateTag(
  tagId: string,
  data: { name?: string; value?: string }
): Promise<PolaroidTag> {
  return api.patch(`/polaroid/tags/${tagId}`, data);
}

export async function deleteTag(tagId: string): Promise<void> {
  return api.delete(`/polaroid/tags/${tagId}`);
}

export async function tagAssets(
  tagId: string,
  assetIds: string[]
): Promise<{ id: string; success: boolean; error?: string }[]> {
  return api.put(`/polaroid/tags/${tagId}/assets`, { ids: assetIds });
}

export async function untagAssets(
  tagId: string,
  assetIds: string[]
): Promise<{ id: string; success: boolean; error?: string }[]> {
  return api.delete(`/polaroid/tags/${tagId}/assets`, { data: { ids: assetIds } });
}

// =============================================================================
// API Keys Functions
// =============================================================================

export async function getApiKeys(): Promise<PolaroidApiKey[]> {
  return api.get('/polaroid/api-keys');
}

export async function createApiKey(name: string): Promise<{ apiKey: PolaroidApiKey; secret: string }> {
  return api.post('/polaroid/api-keys', { name });
}

export async function deleteApiKey(keyId: string): Promise<void> {
  return api.delete(`/polaroid/api-keys/${keyId}`);
}

export async function runJob(
  jobName: string,
  command: 'start' | 'pause' | 'resume' | 'empty' = 'start'
): Promise<{ jobCounts: Record<string, number> }> {
  return api.put(`/polaroid/jobs/${jobName}`, { command });
}

export async function restoreAssets(ids: string[]): Promise<void> {
  return api.post('/polaroid/trash/restore', { ids });
}

export async function getSharedLinkByKey(key: string, password?: string): Promise<PolaroidSharedLink> {
  const params = password ? { password } : undefined;
  const response = await axios.get<PolaroidSharedLink>(
    `${API_CONFIG.baseURL}/polaroid/share/${key}`,
    { params }
  );
  return response.data;
}

export function getShareAssetThumbnailUrl(key: string, assetId: string, size?: string): string {
  const sizeParam = size || 'preview';
  return `${API_CONFIG.baseURL}/polaroid/share/${key}/assets/${assetId}/thumbnail?size=${sizeParam}`;
}

export function getShareAssetOriginalUrl(key: string, assetId: string): string {
  return `${API_CONFIG.baseURL}/polaroid/share/${key}/assets/${assetId}/original`;
}

export async function fetchShareAssetThumbnail(key: string, assetId: string, size?: string): Promise<Blob> {
  const response = await axios.get(
    `${API_CONFIG.baseURL}/polaroid/share/${key}/assets/${assetId}/thumbnail`,
    { params: { size: size || 'preview' }, responseType: 'blob' }
  );
  return response.data;
}

export async function downloadShareAsset(key: string, assetId: string): Promise<Blob> {
  const response = await axios.get(
    `${API_CONFIG.baseURL}/polaroid/share/${key}/assets/${assetId}/original`,
    { responseType: 'blob' }
  );
  return response.data;
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

export function getAssetTypeIcon(type: PolaroidAsset['type']): string {
  const icons: Record<PolaroidAsset['type'], string> = {
    IMAGE: '🖼️',
    VIDEO: '🎬',
    AUDIO: '🎵',
    OTHER: '📄',
  };
  return icons[type] || '📄';
}

export function formatDuration(duration: string): string {
  if (!duration) return '';
  // Duration may come as "0:00:05.000000" or "00:05" format
  const parts = duration.split(':');
  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = Math.floor(parseFloat(parts[2]));
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  return duration;
}
