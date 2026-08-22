/**
 * Polaroid API tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as polaroidApi from '@/lib/api/polaroid';
import { api, apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
  API_CONFIG: {
    baseURL: 'http://localhost:1337/api',
  },
}));

const mockAsset: polaroidApi.PolaroidAsset = {
  id: 'asset-123',
  deviceAssetId: 'device-asset-1',
  ownerId: 'owner-1',
  deviceId: 'device-1',
  type: 'IMAGE',
  originalPath: '/photos/test.jpg',
  originalFileName: 'test.jpg',
  originalMimeType: 'image/jpeg',
  fileCreatedAt: '2024-01-01T00:00:00Z',
  fileModifiedAt: '2024-01-01T00:00:00Z',
  localDateTime: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  isFavorite: false,
  isArchived: false,
  isTrashed: false,
  duration: '0:00:00.000000',
  checksum: 'abc123',
  thumbhash: null,
};

const mockAlbum: polaroidApi.PolaroidAlbum = {
  id: 'album-123',
  albumName: 'Test Album',
  description: 'A test album',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  albumThumbnailAssetId: null,
  shared: false,
  hasSharedLink: false,
  startDate: null,
  endDate: null,
  assetCount: 0,
  owner: { id: 'owner-1', email: 'owner@test.com', name: 'Owner' },
};

const mockPerson: polaroidApi.PolaroidPerson = {
  id: 'person-1',
  name: 'Test Person',
  birthDate: null,
  thumbnailPath: '/thumbnails/person-1.jpg',
  isHidden: false,
};

const mockTag: polaroidApi.PolaroidTag = {
  id: 'tag-1',
  name: 'test-tag',
  value: 'test',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockApiKey: polaroidApi.PolaroidApiKey = {
  id: 'key-1',
  name: 'test-key',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockSharedLink: polaroidApi.PolaroidSharedLink = {
  id: 'link-1',
  description: null,
  password: null,
  key: 'share-key-abc',
  type: 'ALBUM',
  createdAt: '2024-01-01T00:00:00Z',
  expiresAt: null,
  assets: [],
  allowUpload: false,
  allowDownload: true,
  showMetadata: true,
};

const mockServerInfo: polaroidApi.PolaroidServerInfo = {
  photos: 100,
  videos: 10,
  usage: 1073741824,
  usageByUser: [],
};

describe('polaroid API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Server
  // ===========================================================================

  describe('getServerInfo', () => {
    it('should fetch server info', async () => {
      vi.mocked(api.get).mockResolvedValue(mockServerInfo);

      const result = await polaroidApi.getServerInfo();

      expect(api.get).toHaveBeenCalledWith('/polaroid/server/info');
      expect(result).toEqual(mockServerInfo);
    });
  });

  describe('pingServer', () => {
    it('should ping the server and return pong', async () => {
      vi.mocked(api.get).mockResolvedValue({ res: 'pong' });

      const result = await polaroidApi.pingServer();

      expect(api.get).toHaveBeenCalledWith('/polaroid/server/ping');
      expect(result).toEqual({ res: 'pong' });
    });
  });

  // ===========================================================================
  // Assets
  // ===========================================================================

  describe('getAssets', () => {
    it('should fetch assets list', async () => {
      vi.mocked(api.get).mockResolvedValue([mockAsset]);

      const result = await polaroidApi.getAssets();

      expect(api.get).toHaveBeenCalledWith('/polaroid/assets', { params: undefined });
      expect(result).toEqual([mockAsset]);
    });

    it('should pass params to the request', async () => {
      vi.mocked(api.get).mockResolvedValue([]);
      const params = { skip: 0, take: 20, isFavorite: true };

      await polaroidApi.getAssets(params);

      expect(api.get).toHaveBeenCalledWith('/polaroid/assets', { params });
    });
  });

  describe('getAsset', () => {
    it('should fetch asset by id', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAsset);

      const result = await polaroidApi.getAsset('asset-123');

      expect(api.get).toHaveBeenCalledWith('/polaroid/assets/asset-123');
      expect(result).toEqual(mockAsset);
    });
  });

  describe('getAssetStatistics', () => {
    it('should fetch asset statistics', async () => {
      const stats: polaroidApi.PolaroidAssetStatistics = { images: 90, videos: 10, total: 100 };
      vi.mocked(api.get).mockResolvedValue(stats);

      const result = await polaroidApi.getAssetStatistics();

      expect(api.get).toHaveBeenCalledWith('/polaroid/assets/statistics');
      expect(result).toEqual(stats);
    });
  });

  describe('uploadAsset', () => {
    it('should upload an asset via apiClient', async () => {
      const formData = new FormData();
      formData.append('assetData', new Blob(['img']), 'photo.jpg');
      vi.mocked(apiClient.post).mockResolvedValue({ data: mockAsset });

      const result = await polaroidApi.uploadAsset(formData);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/polaroid/assets/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      expect(result).toEqual(mockAsset);
    });
  });

  describe('deleteAssets', () => {
    it('should delete assets by ids', async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined);

      await polaroidApi.deleteAssets(['asset-1', 'asset-2']);

      expect(api.delete).toHaveBeenCalledWith('/polaroid/assets', {
        data: { ids: ['asset-1', 'asset-2'], force: undefined },
      });
    });

    it('should pass force flag when provided', async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined);

      await polaroidApi.deleteAssets(['asset-1'], true);

      expect(api.delete).toHaveBeenCalledWith('/polaroid/assets', {
        data: { ids: ['asset-1'], force: true },
      });
    });
  });

  describe('checkExistingAssets', () => {
    it('should check which assets already exist', async () => {
      const mockResponse = { existingIds: ['device-asset-1'] };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await polaroidApi.checkExistingAssets(['device-asset-1', 'device-asset-2'], 'device-1');

      expect(api.post).toHaveBeenCalledWith('/polaroid/assets/exist', {
        deviceAssetIds: ['device-asset-1', 'device-asset-2'],
        deviceId: 'device-1',
      });
      expect(result).toEqual(mockResponse);
    });
  });

  // ===========================================================================
  // Timeline
  // ===========================================================================

  describe('getTimeBuckets', () => {
    it('should fetch time buckets', async () => {
      const mockBuckets: polaroidApi.PolaroidTimeBucket[] = [
        { timeBucket: '2024-01-01T00:00:00.000Z', count: 5 },
      ];
      vi.mocked(api.get).mockResolvedValue(mockBuckets);
      const params = { size: 'MONTH' };

      const result = await polaroidApi.getTimeBuckets(params);

      expect(api.get).toHaveBeenCalledWith('/polaroid/timeline/buckets', { params });
      expect(result).toEqual(mockBuckets);
    });
  });

  describe('getTimeBucket', () => {
    it('should fetch assets for a time bucket', async () => {
      vi.mocked(api.get).mockResolvedValue([mockAsset]);
      const params = { timeBucket: '2024-01-01T00:00:00.000Z', size: 'MONTH' };

      const result = await polaroidApi.getTimeBucket(params);

      expect(api.get).toHaveBeenCalledWith('/polaroid/timeline/bucket', { params });
      expect(result).toEqual([mockAsset]);
    });
  });

  // ===========================================================================
  // Albums
  // ===========================================================================

  describe('getAlbums', () => {
    it('should fetch all albums', async () => {
      vi.mocked(api.get).mockResolvedValue([mockAlbum]);

      const result = await polaroidApi.getAlbums();

      expect(api.get).toHaveBeenCalledWith('/polaroid/albums', { params: undefined });
      expect(result).toEqual([mockAlbum]);
    });

    it('should pass shared filter param', async () => {
      vi.mocked(api.get).mockResolvedValue([]);

      await polaroidApi.getAlbums(true);

      expect(api.get).toHaveBeenCalledWith('/polaroid/albums', { params: { shared: true } });
    });
  });

  describe('getAlbum', () => {
    it('should fetch album by id', async () => {
      vi.mocked(api.get).mockResolvedValue(mockAlbum);

      const result = await polaroidApi.getAlbum('album-123');

      expect(api.get).toHaveBeenCalledWith('/polaroid/albums/album-123');
      expect(result).toEqual(mockAlbum);
    });
  });

  describe('createAlbum', () => {
    it('should create a new album', async () => {
      const createData = { albumName: 'New Album', description: 'My new album' };
      vi.mocked(api.post).mockResolvedValue(mockAlbum);

      const result = await polaroidApi.createAlbum(createData);

      expect(api.post).toHaveBeenCalledWith('/polaroid/albums', createData);
      expect(result).toEqual(mockAlbum);
    });
  });

  describe('updateAlbum', () => {
    it('should update an album', async () => {
      const updateData = { albumName: 'Updated Album' };
      vi.mocked(api.patch).mockResolvedValue(mockAlbum);

      const result = await polaroidApi.updateAlbum('album-123', updateData);

      expect(api.patch).toHaveBeenCalledWith('/polaroid/albums/album-123', updateData);
      expect(result).toEqual(mockAlbum);
    });
  });

  describe('deleteAlbum', () => {
    it('should delete an album', async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined);

      await polaroidApi.deleteAlbum('album-123');

      expect(api.delete).toHaveBeenCalledWith('/polaroid/albums/album-123');
    });
  });

  describe('addAssetsToAlbum', () => {
    it('should add assets to an album', async () => {
      const mockResult = [{ id: 'asset-1', success: true }];
      vi.mocked(api.put).mockResolvedValue(mockResult);

      const result = await polaroidApi.addAssetsToAlbum('album-123', ['asset-1']);

      expect(api.put).toHaveBeenCalledWith('/polaroid/albums/album-123/assets', { ids: ['asset-1'] });
      expect(result).toEqual(mockResult);
    });
  });

  describe('removeAssetsFromAlbum', () => {
    it('should remove assets from an album', async () => {
      const mockResult = [{ id: 'asset-1', success: true }];
      vi.mocked(api.delete).mockResolvedValue(mockResult);

      const result = await polaroidApi.removeAssetsFromAlbum('album-123', ['asset-1']);

      expect(api.delete).toHaveBeenCalledWith('/polaroid/albums/album-123/assets', {
        data: { ids: ['asset-1'] },
      });
      expect(result).toEqual(mockResult);
    });
  });

  // ===========================================================================
  // People
  // ===========================================================================

  describe('getPeople', () => {
    it('should fetch people list', async () => {
      const mockResponse = { people: [mockPerson], total: 1, hasNextPage: false };
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await polaroidApi.getPeople();

      expect(api.get).toHaveBeenCalledWith('/polaroid/people', { params: undefined });
      expect(result).toEqual(mockResponse);
    });

    it('should pass params to the request', async () => {
      vi.mocked(api.get).mockResolvedValue({ people: [], total: 0, hasNextPage: false });
      const params = { withHidden: true, page: 2 };

      await polaroidApi.getPeople(params);

      expect(api.get).toHaveBeenCalledWith('/polaroid/people', { params });
    });
  });

  describe('getPerson', () => {
    it('should fetch person by id', async () => {
      vi.mocked(api.get).mockResolvedValue(mockPerson);

      const result = await polaroidApi.getPerson('person-1');

      expect(api.get).toHaveBeenCalledWith('/polaroid/people/person-1');
      expect(result).toEqual(mockPerson);
    });
  });

  describe('updatePerson', () => {
    it('should update a person', async () => {
      const updateData = { name: 'Updated Name' };
      vi.mocked(api.put).mockResolvedValue(mockPerson);

      const result = await polaroidApi.updatePerson('person-1', updateData);

      expect(api.put).toHaveBeenCalledWith('/polaroid/people/person-1', updateData);
      expect(result).toEqual(mockPerson);
    });
  });

  describe('mergePeople', () => {
    it('should merge people', async () => {
      const mockResult = [{ id: 'person-2', success: true }];
      vi.mocked(api.post).mockResolvedValue(mockResult);

      const result = await polaroidApi.mergePeople('person-1', ['person-2']);

      expect(api.post).toHaveBeenCalledWith('/polaroid/people/person-1/merge', { ids: ['person-2'] });
      expect(result).toEqual(mockResult);
    });
  });

  // ===========================================================================
  // Search
  // ===========================================================================

  describe('searchMetadata', () => {
    it('should search by metadata', async () => {
      const mockResult: polaroidApi.PolaroidSearchResult = {
        assets: { items: [mockAsset], total: 1, count: 1, nextPage: null },
      };
      vi.mocked(api.post).mockResolvedValue(mockResult);
      const query = { type: 'IMAGE' as const, city: 'New York' };

      const result = await polaroidApi.searchMetadata(query);

      expect(api.post).toHaveBeenCalledWith('/polaroid/search/metadata', query);
      expect(result).toEqual(mockResult);
    });
  });

  describe('searchSmart', () => {
    it('should perform smart search', async () => {
      const mockResult: polaroidApi.PolaroidSearchResult = {
        assets: { items: [mockAsset], total: 1, count: 1, nextPage: null },
      };
      vi.mocked(api.post).mockResolvedValue(mockResult);

      const result = await polaroidApi.searchSmart('sunset at the beach', { type: 'IMAGE' });

      expect(api.post).toHaveBeenCalledWith('/polaroid/search/smart', {
        query: 'sunset at the beach',
        type: 'IMAGE',
      });
      expect(result).toEqual(mockResult);
    });

    it('should work without extra params', async () => {
      vi.mocked(api.post).mockResolvedValue({ assets: { items: [], total: 0, count: 0, nextPage: null } });

      await polaroidApi.searchSmart('cats');

      expect(api.post).toHaveBeenCalledWith('/polaroid/search/smart', { query: 'cats' });
    });
  });

  // ===========================================================================
  // Map
  // ===========================================================================

  describe('getMapMarkers', () => {
    it('should fetch map markers', async () => {
      const mockMarkers: polaroidApi.PolaroidMapMarker[] = [
        { id: 'asset-1', lat: 40.7128, lon: -74.006, city: 'New York', state: 'NY', country: 'US' },
      ];
      vi.mocked(api.get).mockResolvedValue(mockMarkers);

      const result = await polaroidApi.getMapMarkers();

      expect(api.get).toHaveBeenCalledWith('/polaroid/map/markers', { params: undefined });
      expect(result).toEqual(mockMarkers);
    });

    it('should pass filter params', async () => {
      vi.mocked(api.get).mockResolvedValue([]);
      const params = { isFavorite: true };

      await polaroidApi.getMapMarkers(params);

      expect(api.get).toHaveBeenCalledWith('/polaroid/map/markers', { params });
    });
  });

  describe('reverseGeocode', () => {
    it('should reverse geocode coordinates', async () => {
      const mockGeo = { city: 'New York', state: 'NY', country: 'US' };
      vi.mocked(api.get).mockResolvedValue(mockGeo);

      const result = await polaroidApi.reverseGeocode(40.7128, -74.006);

      expect(api.get).toHaveBeenCalledWith('/polaroid/map/reverse-geocode', {
        params: { lat: 40.7128, lng: -74.006 },
      });
      expect(result).toEqual(mockGeo);
    });
  });

  // ===========================================================================
  // Shared Links
  // ===========================================================================

  describe('getSharedLinks', () => {
    it('should fetch all shared links', async () => {
      vi.mocked(api.get).mockResolvedValue([mockSharedLink]);

      const result = await polaroidApi.getSharedLinks();

      expect(api.get).toHaveBeenCalledWith('/polaroid/shared-links');
      expect(result).toEqual([mockSharedLink]);
    });
  });

  describe('getSharedLink', () => {
    it('should fetch shared link by id', async () => {
      vi.mocked(api.get).mockResolvedValue(mockSharedLink);

      const result = await polaroidApi.getSharedLink('link-1');

      expect(api.get).toHaveBeenCalledWith('/polaroid/shared-links/link-1');
      expect(result).toEqual(mockSharedLink);
    });
  });

  describe('createSharedLink', () => {
    it('should create a shared link', async () => {
      const createData = { type: 'ALBUM' as const, albumId: 'album-123' };
      vi.mocked(api.post).mockResolvedValue(mockSharedLink);

      const result = await polaroidApi.createSharedLink(createData);

      expect(api.post).toHaveBeenCalledWith('/polaroid/shared-links', createData);
      expect(result).toEqual(mockSharedLink);
    });
  });

  describe('updateSharedLink', () => {
    it('should update a shared link', async () => {
      const updateData = { allowDownload: false, description: 'Updated' };
      vi.mocked(api.patch).mockResolvedValue(mockSharedLink);

      const result = await polaroidApi.updateSharedLink('link-1', updateData);

      expect(api.patch).toHaveBeenCalledWith('/polaroid/shared-links/link-1', updateData);
      expect(result).toEqual(mockSharedLink);
    });
  });

  describe('deleteSharedLink', () => {
    it('should delete a shared link', async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined);

      await polaroidApi.deleteSharedLink('link-1');

      expect(api.delete).toHaveBeenCalledWith('/polaroid/shared-links/link-1');
    });
  });

  // ===========================================================================
  // Tags
  // ===========================================================================

  describe('getTags', () => {
    it('should fetch all tags', async () => {
      vi.mocked(api.get).mockResolvedValue([mockTag]);

      const result = await polaroidApi.getTags();

      expect(api.get).toHaveBeenCalledWith('/polaroid/tags');
      expect(result).toEqual([mockTag]);
    });
  });

  describe('createTag', () => {
    it('should create a tag', async () => {
      const createData = { name: 'vacation', value: 'vacation' };
      vi.mocked(api.post).mockResolvedValue(mockTag);

      const result = await polaroidApi.createTag(createData);

      expect(api.post).toHaveBeenCalledWith('/polaroid/tags', createData);
      expect(result).toEqual(mockTag);
    });
  });

  describe('updateTag', () => {
    it('should update a tag', async () => {
      const updateData = { name: 'updated-tag' };
      vi.mocked(api.patch).mockResolvedValue(mockTag);

      const result = await polaroidApi.updateTag('tag-1', updateData);

      expect(api.patch).toHaveBeenCalledWith('/polaroid/tags/tag-1', updateData);
      expect(result).toEqual(mockTag);
    });
  });

  describe('deleteTag', () => {
    it('should delete a tag', async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined);

      await polaroidApi.deleteTag('tag-1');

      expect(api.delete).toHaveBeenCalledWith('/polaroid/tags/tag-1');
    });
  });

  describe('tagAssets', () => {
    it('should tag assets', async () => {
      const mockResult = [{ id: 'asset-1', success: true }];
      vi.mocked(api.put).mockResolvedValue(mockResult);

      const result = await polaroidApi.tagAssets('tag-1', ['asset-1']);

      expect(api.put).toHaveBeenCalledWith('/polaroid/tags/tag-1/assets', { ids: ['asset-1'] });
      expect(result).toEqual(mockResult);
    });
  });

  describe('untagAssets', () => {
    it('should untag assets', async () => {
      const mockResult = [{ id: 'asset-1', success: true }];
      vi.mocked(api.delete).mockResolvedValue(mockResult);

      const result = await polaroidApi.untagAssets('tag-1', ['asset-1']);

      expect(api.delete).toHaveBeenCalledWith('/polaroid/tags/tag-1/assets', {
        data: { ids: ['asset-1'] },
      });
      expect(result).toEqual(mockResult);
    });
  });

  // ===========================================================================
  // API Keys
  // ===========================================================================

  describe('getApiKeys', () => {
    it('should fetch all API keys', async () => {
      vi.mocked(api.get).mockResolvedValue([mockApiKey]);

      const result = await polaroidApi.getApiKeys();

      expect(api.get).toHaveBeenCalledWith('/polaroid/api-keys');
      expect(result).toEqual([mockApiKey]);
    });
  });

  describe('createApiKey', () => {
    it('should create an API key', async () => {
      const mockResponse = { apiKey: mockApiKey, secret: 'super-secret-value' };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await polaroidApi.createApiKey('oblak-mobile');

      expect(api.post).toHaveBeenCalledWith('/polaroid/api-keys', { name: 'oblak-mobile' });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteApiKey', () => {
    it('should delete an API key', async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined);

      await polaroidApi.deleteApiKey('key-1');

      expect(api.delete).toHaveBeenCalledWith('/polaroid/api-keys/key-1');
    });
  });

  // ===========================================================================
  // Helper Functions (pure, no mocks needed)
  // ===========================================================================

  describe('formatBytes', () => {
    it('should return "0 B" for zero bytes', () => {
      expect(polaroidApi.formatBytes(0)).toBe('0 B');
    });

    it('should format 1024 bytes as "1 KB"', () => {
      expect(polaroidApi.formatBytes(1024)).toBe('1 KB');
    });

    it('should format with custom decimals', () => {
      expect(polaroidApi.formatBytes(1536, 1)).toBe('1.5 KB');
    });

    it('should accept string input', () => {
      expect(polaroidApi.formatBytes('2048')).toBe('2 KB');
    });

    it('should format megabytes', () => {
      expect(polaroidApi.formatBytes(1048576)).toBe('1 MB');
    });
  });

  describe('getAssetTypeIcon', () => {
    it('should return icon for IMAGE type', () => {
      const icon = polaroidApi.getAssetTypeIcon('IMAGE');
      expect(typeof icon).toBe('string');
      expect(icon.length).toBeGreaterThan(0);
    });

    it('should return icon for VIDEO type', () => {
      const icon = polaroidApi.getAssetTypeIcon('VIDEO');
      expect(typeof icon).toBe('string');
      expect(icon.length).toBeGreaterThan(0);
    });

    it('should return different icons for IMAGE and VIDEO', () => {
      expect(polaroidApi.getAssetTypeIcon('IMAGE')).not.toBe(polaroidApi.getAssetTypeIcon('VIDEO'));
    });
  });

  describe('formatDuration', () => {
    it('should format duration without hours', () => {
      expect(polaroidApi.formatDuration('0:01:30.000000')).toBe('1:30');
    });

    it('should format duration with hours', () => {
      expect(polaroidApi.formatDuration('1:02:03.000000')).toBe('1:02:03');
    });

    it('should return empty string for empty input', () => {
      expect(polaroidApi.formatDuration('')).toBe('');
    });

    it('should zero-pad seconds', () => {
      expect(polaroidApi.formatDuration('0:00:05.000000')).toBe('0:05');
    });
  });

  describe('getAssetThumbnailUrl', () => {
    it('should return URL containing the assetId', () => {
      const url = polaroidApi.getAssetThumbnailUrl('abc123');
      expect(url).toContain('abc123');
    });

    it('should return a string URL', () => {
      const url = polaroidApi.getAssetThumbnailUrl('abc123');
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
    });
  });

  describe('getPersonThumbnailUrl', () => {
    it('should return URL containing the personId', () => {
      const url = polaroidApi.getPersonThumbnailUrl('person-1');
      expect(url).toContain('person-1');
    });

    it('should return a string URL', () => {
      const url = polaroidApi.getPersonThumbnailUrl('person-1');
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
    });
  });
});
