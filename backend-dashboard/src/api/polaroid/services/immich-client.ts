/**
 * Immich Client
 * HTTP client for communicating with the Immich photo management service
 */

import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { basename } from 'path';

// =============================================================================
// Types matching Immich API models
// =============================================================================

export interface ImmichServerInfo {
  photos: number;
  videos: number;
  usage: number;
  usageByUser: ImmichUsageByUser[];
}

export interface ImmichUsageByUser {
  userId: string;
  userName: string;
  photos: number;
  videos: number;
  usage: number;
  quotaSizeInBytes: number | null;
}

export interface ImmichServerAbout {
  version: string;
  versionUrl: string;
  licensed: boolean;
  build?: string;
  buildUrl?: string;
  buildImage?: string;
  buildImageUrl?: string;
  repository?: string;
  repositoryUrl?: string;
  sourceRef?: string;
  sourceCommit?: string;
  sourceUrl?: string;
  nodejs?: string;
  ffmpeg?: string;
  imagemagick?: string;
  libvips?: string;
  exiftool?: string;
}

export interface ImmichPingResponse {
  res: string;
}

export interface ImmichUser {
  id: string;
  email: string;
  name: string;
  profileImagePath: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isAdmin: boolean;
  shouldChangePassword: boolean;
  memoriesEnabled: boolean;
  quotaSizeInBytes: number | null;
  quotaUsageInBytes: number;
}

export interface ImmichApiKey {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImmichApiKeyCreate {
  id: string;
  name: string;
  secret: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImmichLoginResponse {
  accessToken: string;
  userId: string;
  userEmail: string;
  name: string;
  isAdmin: boolean;
}

export interface ImmichAdminCreateUserRequest {
  email: string;
  password: string;
  name: string;
  quotaSizeInBytes?: number | null;
  shouldChangePassword?: boolean;
  storageLabel?: string | null;
}

export interface ImmichAsset {
  id: string;
  deviceAssetId: string;
  deviceId: string;
  ownerId: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  originalPath: string;
  originalFileName: string;
  resized: boolean;
  thumbhash: string | null;
  fileCreatedAt: string;
  fileModifiedAt: string;
  localDateTime: string;
  updatedAt: string;
  isFavorite: boolean;
  isArchived: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isTrashed: boolean;
  isOffline: boolean;
  isReadOnly: boolean;
  isExternal: boolean;
  exifInfo?: ImmichExifInfo;
  smartInfo?: ImmichSmartInfo;
  people?: ImmichPerson[];
  checksum: string;
  duration: string;
  stackParentId?: string | null;
  stack?: ImmichAsset[];
  livePhotoVideoId?: string | null;
  tags?: ImmichTag[];
}

export interface ImmichExifInfo {
  make?: string;
  model?: string;
  exifImageWidth?: number;
  exifImageHeight?: number;
  fileSizeInByte?: number;
  orientation?: string;
  dateTimeOriginal?: string;
  modifyDate?: string;
  lensModel?: string;
  fNumber?: number;
  focalLength?: number;
  iso?: number;
  exposureTime?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  country?: string;
  description?: string;
  fps?: number;
  timeZone?: string;
  rating?: number;
  projectionType?: string;
}

export interface ImmichSmartInfo {
  tags?: string[];
  objects?: string[];
}

export interface ImmichAssetList {
  assets: ImmichAsset[];
  nextPage: string | null;
}

export interface ImmichAssetsParams {
  skip?: number;
  take?: number;
  userId?: string;
  albumId?: string;
  personId?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isTrashed?: boolean;
  order?: 'asc' | 'desc';
  type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  fileCreatedBefore?: string;
  fileCreatedAfter?: string;
  updatedBefore?: string;
  updatedAfter?: string;
  withStacked?: boolean;
  withExif?: boolean;
  withPeople?: boolean;
}

export interface ImmichAssetStatistics {
  images: number;
  videos: number;
  total: number;
}

export interface ImmichCheckExistingAssetsRequest {
  deviceAssetIds: string[];
  deviceId: string;
}

export interface ImmichCheckExistingAssetsResponse {
  existingIds: string[];
}

export interface ImmichDeleteAssetsRequest {
  ids: string[];
  force?: boolean;
}

export interface ImmichTimeBucketsParams {
  size: 'MONTH' | 'DAY';
  userId?: string;
  albumId?: string;
  personId?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isTrashed?: boolean;
  withStacked?: boolean;
  order?: 'asc' | 'desc';
}

export interface ImmichTimeBucket {
  timeBucket: string;
  count: number;
}

export interface ImmichTimeBucketParams extends ImmichTimeBucketsParams {
  timeBucket: string;
}

export interface ImmichAlbum {
  id: string;
  albumName: string;
  description: string;
  albumThumbnailAssetId: string | null;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  owner?: ImmichUser;
  albumUsers?: ImmichAlbumUser[];
  shared: boolean;
  hasSharedLink: boolean;
  startDate?: string;
  endDate?: string;
  assets?: ImmichAsset[];
  assetCount: number;
  isActivityEnabled: boolean;
  order?: 'asc' | 'desc';
  lastModifiedAssetTimestamp?: string;
}

export interface ImmichAlbumUser {
  user: ImmichUser;
  role: 'editor' | 'viewer';
}

export interface ImmichCreateAlbumRequest {
  albumName: string;
  description?: string;
  assetIds?: string[];
  albumUsers?: { userId: string; role: 'editor' | 'viewer' }[];
}

export interface ImmichUpdateAlbumRequest {
  albumName?: string;
  description?: string;
  albumThumbnailAssetId?: string;
  isActivityEnabled?: boolean;
  order?: 'asc' | 'desc';
}

export interface ImmichAlbumAssetsRequest {
  ids: string[];
}

export interface ImmichAlbumAssetsResponse {
  successfullyAdded?: number;
  alreadyInAlbum?: ImmichAsset[];
  errors?: ImmichBulkIdError[];
}

export interface ImmichBulkIdError {
  id: string;
  error: string;
}

export interface ImmichPerson {
  id: string;
  name: string;
  birthDate: string | null;
  thumbnailPath: string;
  isHidden: boolean;
  updatedAt: string;
  faces?: ImmichFace[];
}

export interface ImmichFace {
  id: string;
  imageHeight: number;
  imageWidth: number;
  boundingBoxX1: number;
  boundingBoxX2: number;
  boundingBoxY1: number;
  boundingBoxY2: number;
}

export interface ImmichPeopleResponse {
  people: ImmichPerson[];
  total: number;
  visible: number;
}

export interface ImmichPeopleParams {
  page?: number;
  size?: number;
  withHidden?: boolean;
}

export interface ImmichUpdatePersonRequest {
  name?: string;
  birthDate?: string | null;
  isHidden?: boolean;
  featureFaceAssetId?: string;
}

export interface ImmichMergePeopleRequest {
  ids: string[];
}

export interface ImmichReassignFacesRequest {
  data: { id: string }[];
}

export interface ImmichSearchMetadataRequest {
  city?: string;
  country?: string;
  createdAfter?: string;
  createdBefore?: string;
  deviceAssetId?: string;
  deviceId?: string;
  isArchived?: boolean;
  isEncoded?: boolean;
  isFavorite?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isMotion?: boolean;
  isNotInAlbum?: boolean;
  isOffline?: boolean;
  isReadOnly?: boolean;
  isTrashed?: boolean;
  isVisible?: boolean;
  lensModel?: string;
  libraryId?: string;
  make?: string;
  model?: string;
  page?: number;
  personIds?: string[];
  size?: number;
  state?: string;
  takenAfter?: string;
  takenBefore?: string;
  trashedAfter?: string;
  trashedBefore?: string;
  type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  updatedAfter?: string;
  updatedBefore?: string;
  withArchived?: boolean;
  withDeleted?: boolean;
  withExif?: boolean;
  withPeople?: boolean;
  withStacked?: boolean;
}

export interface ImmichSearchSmartRequest {
  query: string;
  city?: string;
  country?: string;
  createdAfter?: string;
  createdBefore?: string;
  isArchived?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isFavorite?: boolean;
  isNotInAlbum?: boolean;
  language?: string;
  page?: number;
  size?: number;
  state?: string;
  takenAfter?: string;
  takenBefore?: string;
  type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  withArchived?: boolean;
}

export interface ImmichSearchResponse {
  assets: {
    items: ImmichAsset[];
    nextPage: string | null;
    total: number;
    count: number;
    facets?: ImmichSearchFacet[];
  };
}

export interface ImmichSearchFacet {
  fieldName: string;
  counts: { count: number; value: string }[];
}

export interface ImmichMapMarker {
  id: string;
  lat: number;
  lon: number;
  city?: string;
  state?: string;
  country?: string;
}

export interface ImmichMapMarkersParams {
  isArchived?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isFavorite?: boolean;
  fileCreatedAfter?: string;
  fileCreatedBefore?: string;
  withPartners?: boolean;
}

export interface ImmichReverseGeocodeResponse {
  city?: string;
  state?: string;
  country?: string;
}

export interface ImmichSharedLink {
  id: string;
  type: 'ALBUM' | 'INDIVIDUAL';
  key: string;
  description: string | null;
  password: string | null;
  userId: string;
  album?: ImmichAlbum;
  assets: ImmichAsset[];
  createdAt: string;
  expiresAt: string | null;
  allowUpload: boolean;
  allowDownload: boolean;
  showMetadata: boolean;
}

export interface ImmichCreateSharedLinkRequest {
  type: 'ALBUM' | 'INDIVIDUAL';
  albumId?: string;
  assetIds?: string[];
  expiresAt?: string | null;
  allowUpload?: boolean;
  allowDownload?: boolean;
  showMetadata?: boolean;
  password?: string;
  description?: string;
}

export interface ImmichUpdateSharedLinkRequest {
  description?: string;
  password?: string | null;
  expiresAt?: string | null;
  allowUpload?: boolean;
  allowDownload?: boolean;
  showMetadata?: boolean;
}

export interface ImmichTag {
  id: string;
  name: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string | null;
}

export interface ImmichCreateTagRequest {
  name: string;
  parentId?: string;
}

export interface ImmichUpdateTagRequest {
  name?: string;
  color?: string;
}

export interface ImmichTagAssetsRequest {
  ids: string[];
}

export interface ImmichUpdateAssetRequest {
  isFavorite?: boolean;
  isArchived?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  description?: string;
  dateTimeOriginal?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
}

// =============================================================================
// Error handling
// =============================================================================

export class ImmichClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'ImmichClientError';
  }
}

// =============================================================================
// Client implementation
// =============================================================================

interface ImmichClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  retries?: number;
}

export function createImmichClient(config: ImmichClientConfig) {
  const { baseUrl, apiKey, timeout = 30000, retries = 3 } = config;

  async function request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      formData?: FormData;
      query?: Record<string, string | number | boolean | undefined>;
      rawResponse?: boolean;
    } = {}
  ): Promise<T> {
    const { body, headers = {}, formData, query, rawResponse = false } = options;

    let url = `${baseUrl}${path}`;

    if (query) {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const requestHeaders: Record<string, string> = {
      'x-api-key': apiKey,
      ...headers,
    };

    if (body && !formData) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: formData ? formData : body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = errorText;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorJson.message || errorText;
          } catch {
            // Use raw text
          }
          throw new ImmichClientError(errorMessage, response.status);
        }

        if (rawResponse) {
          return response as unknown as T;
        }

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return await response.json() as T;
        }

        // For binary responses, return as-is
        return response as unknown as T;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof ImmichClientError) {
          // Don't retry client errors (4xx)
          if (error.statusCode >= 400 && error.statusCode < 500) {
            throw error;
          }
        }

        // Retry on network errors or 5xx
        if (attempt < retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          );
        }
      }
    }

    throw lastError || new Error('Request failed');
  }

  return {
    // =========================================================================
    // Server
    // =========================================================================

    async ping(): Promise<ImmichPingResponse> {
      return request('GET', '/api/server/ping');
    },

    async getServerInfo(): Promise<ImmichServerInfo> {
      return request('GET', '/api/server/statistics');
    },

    async getServerAbout(): Promise<ImmichServerAbout> {
      return request('GET', '/api/server/about');
    },

    // =========================================================================
    // Auth / Users
    // =========================================================================

    async getMyUser(): Promise<ImmichUser> {
      return request('GET', '/api/users/me');
    },

    async createApiKey(name: string): Promise<ImmichApiKeyCreate> {
      return request('POST', '/api/api-keys', { body: { name, permissions: ['all'] } });
    },

    async getApiKeys(): Promise<ImmichApiKey[]> {
      return request('GET', '/api/api-keys');
    },

    async deleteApiKey(id: string): Promise<void> {
      return request('DELETE', `/api/api-keys/${id}`);
    },

    async adminCreateUser(data: ImmichAdminCreateUserRequest): Promise<ImmichUser> {
      return request('POST', '/api/admin/users', { body: data });
    },

    async loginUser(email: string, password: string): Promise<ImmichLoginResponse> {
      // Uses email/password auth — NOT x-api-key; must bypass the request() helper
      const url = `${baseUrl}/api/auth/login`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new ImmichClientError(errorText, response.status);
      }
      return response.json() as Promise<ImmichLoginResponse>;
    },

    async createApiKeyWithToken(accessToken: string, name: string): Promise<ImmichApiKeyCreate> {
      // Uses Bearer token auth — NOT x-api-key; must bypass the request() helper
      const url = `${baseUrl}/api/api-keys`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, permissions: ['all'] }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new ImmichClientError(errorText, response.status);
      }
      return response.json() as Promise<ImmichApiKeyCreate>;
    },

    // =========================================================================
    // Assets
    // =========================================================================

    async getAssets(params: ImmichAssetsParams): Promise<ImmichAsset[]> {
      return request('GET', '/api/assets', {
        query: params as Record<string, string | number | boolean | undefined>,
      });
    },

    async getAssetInfo(id: string): Promise<ImmichAsset> {
      return request('GET', `/api/assets/${id}`);
    },

    async updateAsset(id: string, data: ImmichUpdateAssetRequest): Promise<ImmichAsset> {
      return request('PUT', `/api/assets/${id}`, { body: data });
    },

    async deleteAssets(ids: string[], force = false): Promise<void> {
      return request('DELETE', '/api/assets', { body: { ids, force } });
    },

    async getAssetThumbnail(id: string, size?: 'thumbnail' | 'preview'): Promise<Response> {
      return request('GET', `/api/assets/${id}/thumbnail`, {
        query: size ? { size } : undefined,
        rawResponse: true,
      });
    },

    async downloadAsset(id: string): Promise<Response> {
      return request('GET', `/api/assets/${id}/original`, { rawResponse: true });
    },

    async uploadAsset(file: {
      filepath: string;
      originalFilename: string;
      mimetype: string;
    }): Promise<ImmichAsset> {
      const fileStat = await stat(file.filepath);
      const now = new Date().toISOString();
      const deviceAssetId = `oblak-${Date.now()}-${basename(file.originalFilename)}`;

      const formData = new FormData();
      const stream = createReadStream(file.filepath);
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const blob = new Blob(chunks, { type: file.mimetype });

      formData.append('assetData', blob, file.originalFilename);
      formData.append('deviceAssetId', deviceAssetId);
      formData.append('deviceId', 'oblak-dashboard');
      formData.append('fileCreatedAt', fileStat.birthtime?.toISOString() || now);
      formData.append('fileModifiedAt', fileStat.mtime?.toISOString() || now);

      return request('POST', '/api/assets', { formData });
    },

    async checkExistingAssets(
      deviceAssetIds: string[],
      deviceId: string
    ): Promise<ImmichCheckExistingAssetsResponse> {
      return request('POST', '/api/assets/exist', {
        body: { deviceAssetIds, deviceId },
      });
    },

    async getAssetStatistics(): Promise<ImmichAssetStatistics> {
      return request('GET', '/api/assets/statistics');
    },

    // =========================================================================
    // Timeline
    // =========================================================================

    async getTimeBuckets(params: ImmichTimeBucketsParams): Promise<ImmichTimeBucket[]> {
      return request('GET', '/api/timeline/buckets', {
        query: params as unknown as Record<string, string | number | boolean | undefined>,
      });
    },

    async getTimeBucket(params: ImmichTimeBucketParams): Promise<ImmichAsset[]> {
      const raw = await request<Record<string, unknown[]> | ImmichAsset[]>('GET', '/api/timeline/bucket', {
        query: params as unknown as Record<string, string | number | boolean | undefined>,
      });

      if (Array.isArray(raw)) {
        return raw;
      }

      const keys = Object.keys(raw);
      if (keys.length === 0) return [];
      const count = (raw[keys[0]] as unknown[]).length;

      const assets: ImmichAsset[] = [];
      for (let i = 0; i < count; i++) {
        const asset: Record<string, unknown> = {};
        for (const key of keys) {
          asset[key] = (raw[key] as unknown[])[i];
        }
        if (asset.isImage !== undefined && asset.type === undefined) {
          asset.type = asset.isImage ? 'IMAGE' : 'VIDEO';
        }
        assets.push(asset as unknown as ImmichAsset);
      }
      return assets;
    },

    // =========================================================================
    // Albums
    // =========================================================================

    async getAlbums(shared?: boolean): Promise<ImmichAlbum[]> {
      return request('GET', '/api/albums', {
        query: shared !== undefined ? { shared } : undefined,
      });
    },

    async getAlbum(id: string): Promise<ImmichAlbum> {
      return request('GET', `/api/albums/${id}`);
    },

    async createAlbum(data: ImmichCreateAlbumRequest): Promise<ImmichAlbum> {
      return request('POST', '/api/albums', { body: data });
    },

    async updateAlbum(id: string, data: ImmichUpdateAlbumRequest): Promise<ImmichAlbum> {
      return request('PATCH', `/api/albums/${id}`, { body: data });
    },

    async deleteAlbum(id: string): Promise<void> {
      return request('DELETE', `/api/albums/${id}`);
    },

    async addAssetsToAlbum(albumId: string, assetIds: string[]): Promise<ImmichAlbumAssetsResponse> {
      return request('PUT', `/api/albums/${albumId}/assets`, {
        body: { ids: assetIds },
      });
    },

    async removeAssetsFromAlbum(albumId: string, assetIds: string[]): Promise<ImmichAlbumAssetsResponse> {
      return request('DELETE', `/api/albums/${albumId}/assets`, {
        body: { ids: assetIds },
      });
    },

    // =========================================================================
    // People
    // =========================================================================

    async getPeople(params?: ImmichPeopleParams): Promise<ImmichPeopleResponse> {
      return request('GET', '/api/people', {
        query: params as Record<string, string | number | boolean | undefined> | undefined,
      });
    },

    async getPerson(id: string): Promise<ImmichPerson> {
      return request('GET', `/api/people/${id}`);
    },

    async updatePerson(id: string, data: ImmichUpdatePersonRequest): Promise<ImmichPerson> {
      return request('PUT', `/api/people/${id}`, { body: data });
    },

    async getPersonThumbnail(id: string): Promise<Response> {
      return request('GET', `/api/people/${id}/thumbnail`, { rawResponse: true });
    },

    async mergePeople(id: string, mergeIds: string[]): Promise<ImmichBulkIdError[]> {
      return request('POST', `/api/people/${id}/merge`, { body: { ids: mergeIds } });
    },

    async reassignFaces(id: string, data: ImmichReassignFacesRequest): Promise<ImmichPerson[]> {
      return request('PUT', `/api/people/${id}/reassign`, { body: data });
    },

    // =========================================================================
    // Search
    // =========================================================================

    async searchAssets(query: ImmichSearchMetadataRequest): Promise<ImmichSearchResponse> {
      return request('POST', '/api/search/metadata', { body: query });
    },

    async searchSmart(
      query: string,
      params?: Omit<ImmichSearchSmartRequest, 'query'>
    ): Promise<ImmichSearchResponse> {
      return request('POST', '/api/search/smart', { body: { query, ...params } });
    },

    // =========================================================================
    // Map
    // =========================================================================

    async getMapMarkers(params?: ImmichMapMarkersParams): Promise<ImmichMapMarker[]> {
      return request('GET', '/api/map/markers', {
        query: params as Record<string, string | number | boolean | undefined> | undefined,
      });
    },

    async reverseGeocode(lat: number, lng: number): Promise<ImmichReverseGeocodeResponse[]> {
      return request('GET', '/api/map/reverse-geocode', {
        query: { lat, lng },
      });
    },

    // =========================================================================
    // Sharing
    // =========================================================================

    async getSharedLinks(): Promise<ImmichSharedLink[]> {
      return request('GET', '/api/shared-links');
    },

    async getSharedLink(id: string): Promise<ImmichSharedLink> {
      return request('GET', `/api/shared-links/${id}`);
    },

    async createSharedLink(data: ImmichCreateSharedLinkRequest): Promise<ImmichSharedLink> {
      return request('POST', '/api/shared-links', { body: data });
    },

    async updateSharedLink(id: string, data: ImmichUpdateSharedLinkRequest): Promise<ImmichSharedLink> {
      return request('PATCH', `/api/shared-links/${id}`, { body: data });
    },

    async deleteSharedLink(id: string): Promise<void> {
      return request('DELETE', `/api/shared-links/${id}`);
    },

    async getSharedLinkByKey(key: string, password?: string): Promise<ImmichSharedLink> {
      const headers: Record<string, string> = { 'x-immich-share-key': key };
      if (password) {
        headers['password'] = password;
      }
      return request('GET', '/api/shared-links/me', { headers });
    },

    async getSharedLinkAssetThumbnail(key: string, assetId: string, size?: 'thumbnail' | 'preview', password?: string): Promise<Response> {
      const headers: Record<string, string> = { 'x-immich-share-key': key };
      if (password) {
        headers['password'] = password;
      }
      return request('GET', `/api/assets/${assetId}/thumbnail`, {
        query: size ? { size } : undefined,
        headers,
        rawResponse: true,
      });
    },

    async getSharedLinkAssetOriginal(key: string, assetId: string, password?: string): Promise<Response> {
      const headers: Record<string, string> = { 'x-immich-share-key': key };
      if (password) {
        headers['password'] = password;
      }
      return request('GET', `/api/assets/${assetId}/original`, {
        headers,
        rawResponse: true,
      });
    },

    // =========================================================================
    // Tags
    // =========================================================================

    async getTags(): Promise<ImmichTag[]> {
      return request('GET', '/api/tags');
    },

    async createTag(data: ImmichCreateTagRequest): Promise<ImmichTag> {
      return request('POST', '/api/tags', { body: data });
    },

    async updateTag(id: string, data: ImmichUpdateTagRequest): Promise<ImmichTag> {
      return request('PATCH', `/api/tags/${id}`, { body: data });
    },

    async deleteTag(id: string): Promise<void> {
      return request('DELETE', `/api/tags/${id}`);
    },

    async tagAssets(id: string, assetIds: string[]): Promise<ImmichBulkIdError[]> {
      return request('PUT', `/api/tags/${id}/assets`, { body: { ids: assetIds } });
    },

    async untagAssets(id: string, assetIds: string[]): Promise<ImmichBulkIdError[]> {
      return request('DELETE', `/api/tags/${id}/assets`, { body: { ids: assetIds } });
    },

    // =========================================================================
    // Jobs
    // =========================================================================

    async runJob(jobName: string, command: 'start' | 'pause' | 'resume' | 'empty'): Promise<{ jobCounts: Record<string, number> }> {
      return request('PUT', `/api/jobs/${jobName}`, { body: { command } });
    },

    // =========================================================================
    // Trash
    // =========================================================================

    async restoreAssets(assetIds: string[]): Promise<void> {
      return request('POST', '/api/trash/restore/assets', { body: { ids: assetIds } });
    },
  };
}

export type ImmichClient = ReturnType<typeof createImmichClient>;
