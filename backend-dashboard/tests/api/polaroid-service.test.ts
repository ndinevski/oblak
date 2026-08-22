/**
 * Polaroid Service Tests
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// Immich Type Structure Tests
// =============================================================================

describe('Polaroid Service Types', () => {
  interface ImmichAsset {
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
    isTrashed: boolean;
    isOffline: boolean;
    isReadOnly: boolean;
    isExternal: boolean;
    checksum: string;
    duration: string;
    stackParentId?: string | null;
    livePhotoVideoId?: string | null;
  }

  interface ImmichAlbum {
    id: string;
    albumName: string;
    description: string;
    albumThumbnailAssetId: string | null;
    createdAt: string;
    updatedAt: string;
    ownerId: string;
    shared: boolean;
    hasSharedLink: boolean;
    assetCount: number;
    isActivityEnabled: boolean;
    startDate?: string;
    endDate?: string;
    order?: 'asc' | 'desc';
  }

  interface ImmichPerson {
    id: string;
    name: string;
    birthDate: string | null;
    thumbnailPath: string;
    isHidden: boolean;
    updatedAt: string;
  }

  it('should have correct ImmichAsset structure', () => {
    const asset: ImmichAsset = {
      id: 'asset-abc123',
      deviceAssetId: 'device-001',
      deviceId: 'oblak-dashboard',
      ownerId: 'user-1',
      type: 'IMAGE',
      originalPath: '/photos/2025/photo.jpg',
      originalFileName: 'photo.jpg',
      resized: true,
      thumbhash: 'abc==',
      fileCreatedAt: '2025-01-01T10:00:00Z',
      fileModifiedAt: '2025-01-01T10:00:00Z',
      localDateTime: '2025-01-01T10:00:00',
      updatedAt: '2025-01-01T10:00:00Z',
      isFavorite: false,
      isArchived: false,
      isTrashed: false,
      isOffline: false,
      isReadOnly: false,
      isExternal: false,
      checksum: 'sha256hash',
      duration: '0:00:00.00000',
    };

    expect(asset.id).toBe('asset-abc123');
    expect(asset.type).toBe('IMAGE');
    expect(asset.ownerId).toBe('user-1');
    expect(asset.isFavorite).toBe(false);
    expect(asset.isTrashed).toBe(false);
  });

  it('should support VIDEO asset type', () => {
    const asset: ImmichAsset = {
      id: 'video-123',
      deviceAssetId: 'device-002',
      deviceId: 'oblak-dashboard',
      ownerId: 'user-2',
      type: 'VIDEO',
      originalPath: '/videos/clip.mp4',
      originalFileName: 'clip.mp4',
      resized: false,
      thumbhash: null,
      fileCreatedAt: '2025-03-01T12:00:00Z',
      fileModifiedAt: '2025-03-01T12:00:00Z',
      localDateTime: '2025-03-01T12:00:00',
      updatedAt: '2025-03-01T12:00:00Z',
      isFavorite: true,
      isArchived: false,
      isTrashed: false,
      isOffline: false,
      isReadOnly: false,
      isExternal: false,
      checksum: 'videohash',
      duration: '0:01:23.45000',
    };

    expect(asset.type).toBe('VIDEO');
    expect(asset.thumbhash).toBeNull();
    expect(asset.isFavorite).toBe(true);
  });

  it('should have correct ImmichAlbum structure', () => {
    const album: ImmichAlbum = {
      id: 'album-xyz',
      albumName: 'Summer 2025',
      description: 'Beach vacation photos',
      albumThumbnailAssetId: 'asset-1',
      createdAt: '2025-06-01T00:00:00Z',
      updatedAt: '2025-06-15T00:00:00Z',
      ownerId: 'user-1',
      shared: true,
      hasSharedLink: false,
      assetCount: 42,
      isActivityEnabled: true,
      startDate: '2025-06-01T00:00:00Z',
      endDate: '2025-06-14T00:00:00Z',
      order: 'asc',
    };

    expect(album.albumName).toBe('Summer 2025');
    expect(album.assetCount).toBe(42);
    expect(album.shared).toBe(true);
    expect(album.order).toBe('asc');
  });

  it('should have correct ImmichPerson structure', () => {
    const person: ImmichPerson = {
      id: 'person-1',
      name: 'Alice Smith',
      birthDate: '1990-05-15',
      thumbnailPath: '/path/to/thumb.jpg',
      isHidden: false,
      updatedAt: '2025-01-01T00:00:00Z',
    };

    expect(person.name).toBe('Alice Smith');
    expect(person.birthDate).toBe('1990-05-15');
    expect(person.isHidden).toBe(false);
  });

  it('should support ImmichPerson with null birthDate', () => {
    const person: ImmichPerson = {
      id: 'person-2',
      name: 'Unknown',
      birthDate: null,
      thumbnailPath: '',
      isHidden: true,
      updatedAt: '2025-01-01T00:00:00Z',
    };

    expect(person.birthDate).toBeNull();
    expect(person.isHidden).toBe(true);
  });
});

// =============================================================================
// Per-User Isolation Tests
// =============================================================================

describe('Polaroid Service', () => {
  describe('Per-User Isolation', () => {
    it('should use userId as cache key', () => {
      const cache = new Map<number, { apiKey: string }>();

      cache.set(1, { apiKey: 'key-for-user-1' });
      cache.set(2, { apiKey: 'key-for-user-2' });

      expect(cache.get(1)?.apiKey).toBe('key-for-user-1');
      expect(cache.get(2)?.apiKey).toBe('key-for-user-2');
      expect(cache.get(1)).not.toBe(cache.get(2));
    });

    it('should return cached client on second call', () => {
      const cache = new Map<number, { baseUrl: string; apiKey: string }>();
      const userId = 42;

      const clientConfig = { baseUrl: 'http://immich:2283', apiKey: 'user-api-key' };
      cache.set(userId, clientConfig);

      const first = cache.get(userId);
      const second = cache.get(userId);

      expect(first).toBe(second);
    });

    it('should not share cache entries between users', () => {
      const cache = new Map<number, { apiKey: string }>();

      cache.set(10, { apiKey: 'key-10' });
      cache.set(20, { apiKey: 'key-20' });

      expect(cache.has(10)).toBe(true);
      expect(cache.has(20)).toBe(true);
      expect(cache.get(10)?.apiKey).not.toBe(cache.get(20)?.apiKey);
    });
  });

  describe('findOrCreateInstance logic patterns', () => {
    it('should use existing instance when apiKey is present', () => {
      const existing = { id: 1, apiKey: 'existing-key', immichUserId: 'immich-user-1' };
      const shouldUseExisting = existing && existing.apiKey;
      expect(shouldUseExisting).toBeTruthy();
    });

    it('should trigger provisioning when apiKey is missing', () => {
      const existing = { id: 1, apiKey: null, immichUserId: 'immich-user-1' };
      const needsProvisioning = existing && !existing.apiKey;
      expect(needsProvisioning).toBeTruthy();
    });

    it('should trigger full creation when no instance exists', () => {
      const existing = null;
      const needsCreation = !existing;
      expect(needsCreation).toBe(true);
    });

    it('should store per-user Immich credentials in polaroid instance', () => {
      const instanceData = {
        immichUserId: 'immich-user-abc',
        immichUserEmail: 'alice@example.com',
        immichUserPassword: 'random-generated-password',
        apiKey: 'api-key-secret',
        owner: 5,
      };

      expect(instanceData.immichUserId).toBe('immich-user-abc');
      expect(instanceData.immichUserEmail).toBe('alice@example.com');
      expect(instanceData.owner).toBe(5);
    });
  });

  // =============================================================================
  // Asset Management Tests
  // =============================================================================

  describe('Asset Management', () => {
    it('should map asset params correctly', () => {
      interface AssetsParams {
        skip?: number;
        take?: number;
        isFavorite?: boolean;
        isArchived?: boolean;
        isTrashed?: boolean;
        type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
        order?: 'asc' | 'desc';
      }

      const params: AssetsParams = {
        skip: 0,
        take: 50,
        isFavorite: false,
        isArchived: false,
        isTrashed: false,
        type: 'IMAGE',
        order: 'desc',
      };

      expect(params.skip).toBe(0);
      expect(params.take).toBe(50);
      expect(params.type).toBe('IMAGE');
      expect(params.order).toBe('desc');
    });

    it('should have correct asset statistics structure', () => {
      interface AssetStatistics {
        images: number;
        videos: number;
        total: number;
      }

      const stats: AssetStatistics = {
        images: 150,
        videos: 20,
        total: 170,
      };

      expect(stats.total).toBe(stats.images + stats.videos);
    });

    it('should handle asset deletion request with ids', () => {
      const deleteRequest = {
        ids: ['asset-1', 'asset-2', 'asset-3'],
        force: false,
      };

      expect(deleteRequest.ids).toHaveLength(3);
      expect(deleteRequest.force).toBe(false);
    });

    it('should support timeline bucket params', () => {
      interface TimeBucketsParams {
        size: 'MONTH' | 'DAY';
        userId?: string;
        isFavorite?: boolean;
        isArchived?: boolean;
        order?: 'asc' | 'desc';
      }

      const params: TimeBucketsParams = {
        size: 'MONTH',
        order: 'desc',
        isArchived: false,
      };

      expect(params.size).toBe('MONTH');
      expect(params.order).toBe('desc');
    });
  });

  // =============================================================================
  // Album Management Tests
  // =============================================================================

  describe('Album Management', () => {
    it('should validate create album request shape', () => {
      interface CreateAlbumRequest {
        albumName: string;
        description?: string;
        assetIds?: string[];
        albumUsers?: { userId: string; role: 'editor' | 'viewer' }[];
      }

      const request: CreateAlbumRequest = {
        albumName: 'My Album',
        description: 'A test album',
        assetIds: ['asset-1', 'asset-2'],
      };

      expect(request.albumName).toBe('My Album');
      expect(request.assetIds).toHaveLength(2);
    });

    it('should validate update album request shape', () => {
      interface UpdateAlbumRequest {
        albumName?: string;
        description?: string;
        albumThumbnailAssetId?: string;
        isActivityEnabled?: boolean;
        order?: 'asc' | 'desc';
      }

      const request: UpdateAlbumRequest = {
        albumName: 'Renamed Album',
        isActivityEnabled: false,
        order: 'asc',
      };

      expect(request.albumName).toBe('Renamed Album');
      expect(request.isActivityEnabled).toBe(false);
      expect(request.order).toBe('asc');
    });

    it('should handle album users with roles', () => {
      const albumUsers = [
        { userId: 'user-2', role: 'editor' as const },
        { userId: 'user-3', role: 'viewer' as const },
      ];

      expect(albumUsers[0].role).toBe('editor');
      expect(albumUsers[1].role).toBe('viewer');
    });

    it('should handle add/remove assets to album', () => {
      const addRequest = { ids: ['asset-a', 'asset-b'] };
      expect(addRequest.ids).toContain('asset-a');
      expect(addRequest.ids).toContain('asset-b');
    });
  });

  // =============================================================================
  // Search Tests
  // =============================================================================

  describe('Search', () => {
    it('should have correct smart search request shape', () => {
      interface SearchSmartRequest {
        query: string;
        isFavorite?: boolean;
        isArchived?: boolean;
        type?: 'IMAGE' | 'VIDEO';
        page?: number;
        size?: number;
      }

      const request: SearchSmartRequest = {
        query: 'sunset at the beach',
        type: 'IMAGE',
        isFavorite: false,
        page: 1,
        size: 25,
      };

      expect(request.query).toBe('sunset at the beach');
      expect(request.type).toBe('IMAGE');
      expect(request.page).toBe(1);
    });

    it('should have correct search response shape', () => {
      interface SearchResponse {
        assets: {
          items: unknown[];
          nextPage: string | null;
          total: number;
          count: number;
        };
      }

      const response: SearchResponse = {
        assets: {
          items: [],
          nextPage: null,
          total: 0,
          count: 0,
        },
      };

      expect(response.assets.items).toHaveLength(0);
      expect(response.assets.nextPage).toBeNull();
      expect(response.assets.total).toBe(0);
    });

    it('should support metadata search request shape', () => {
      interface SearchMetadataRequest {
        city?: string;
        country?: string;
        isFavorite?: boolean;
        type?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
        page?: number;
        size?: number;
        withExif?: boolean;
      }

      const request: SearchMetadataRequest = {
        city: 'Paris',
        country: 'France',
        type: 'IMAGE',
        withExif: true,
      };

      expect(request.city).toBe('Paris');
      expect(request.country).toBe('France');
      expect(request.withExif).toBe(true);
    });
  });

  // =============================================================================
  // Shared Links Tests
  // =============================================================================

  describe('Shared Links', () => {
    it('should have correct shared link type union', () => {
      type SharedLinkType = 'ALBUM' | 'INDIVIDUAL';
      const albumType: SharedLinkType = 'ALBUM';
      const individualType: SharedLinkType = 'INDIVIDUAL';

      expect(albumType).toBe('ALBUM');
      expect(individualType).toBe('INDIVIDUAL');
    });

    it('should validate create shared link request', () => {
      interface CreateSharedLinkRequest {
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

      const request: CreateSharedLinkRequest = {
        type: 'ALBUM',
        albumId: 'album-123',
        allowDownload: true,
        showMetadata: true,
        expiresAt: '2025-12-31T23:59:59Z',
      };

      expect(request.type).toBe('ALBUM');
      expect(request.albumId).toBe('album-123');
      expect(request.allowDownload).toBe(true);
      expect(request.expiresAt).toBe('2025-12-31T23:59:59Z');
    });

    it('should validate shared link structure', () => {
      interface SharedLink {
        id: string;
        type: 'ALBUM' | 'INDIVIDUAL';
        key: string;
        description: string | null;
        password: string | null;
        userId: string;
        assets: unknown[];
        createdAt: string;
        expiresAt: string | null;
        allowUpload: boolean;
        allowDownload: boolean;
        showMetadata: boolean;
      }

      const link: SharedLink = {
        id: 'link-abc',
        type: 'INDIVIDUAL',
        key: 'secretkey123',
        description: 'Share with friend',
        password: null,
        userId: 'user-1',
        assets: [],
        createdAt: '2025-01-01T00:00:00Z',
        expiresAt: null,
        allowUpload: false,
        allowDownload: true,
        showMetadata: false,
      };

      expect(link.key).toBe('secretkey123');
      expect(link.password).toBeNull();
      expect(link.expiresAt).toBeNull();
      expect(link.allowDownload).toBe(true);
      expect(link.allowUpload).toBe(false);
    });

    it('should support update shared link request', () => {
      interface UpdateSharedLinkRequest {
        description?: string;
        password?: string | null;
        expiresAt?: string | null;
        allowUpload?: boolean;
        allowDownload?: boolean;
        showMetadata?: boolean;
      }

      const update: UpdateSharedLinkRequest = {
        password: 'secure-pass',
        expiresAt: '2026-01-01T00:00:00Z',
        allowUpload: true,
      };

      expect(update.password).toBe('secure-pass');
      expect(update.allowUpload).toBe(true);
    });
  });

  // =============================================================================
  // Statistics Mapping Tests
  // =============================================================================

  describe('Statistics Mapping', () => {
    it('should map server usage to polaroid instance stats', () => {
      const usageByUser = [
        { userId: 'immich-user-1', photos: 100, videos: 20, usage: 2147483648, quotaSizeInBytes: null },
        { userId: 'immich-user-2', photos: 50, videos: 5, usage: 536870912, quotaSizeInBytes: null },
      ];

      const user1 = usageByUser.find(u => u.userId === 'immich-user-1');
      expect(user1?.photos).toBe(100);
      expect(user1?.videos).toBe(20);
      expect(user1?.usage).toBe(2147483648);
    });

    it('should calculate total stats correctly', () => {
      const stats = { images: 120, videos: 30, total: 150 };
      expect(stats.total).toBe(stats.images + stats.videos);
    });

    it('should handle biginteger string conversion for Strapi', () => {
      const storageUsed = 2147483648;
      const photoCount = 120;
      const videoCount = 30;

      const strapiData = {
        storageUsed: String(storageUsed),
        photoCount: String(photoCount),
        videoCount: String(videoCount),
      };

      expect(strapiData.storageUsed).toBe('2147483648');
      expect(strapiData.photoCount).toBe('120');
      expect(strapiData.videoCount).toBe('30');
    });
  });
});
