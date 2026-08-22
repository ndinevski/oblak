/**
 * usePolaroid hooks tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useServerInfo,
  useAssets,
  useAsset,
  useAlbums,
  useAlbum,
  usePeople,
  useTags,
  useApiKeys,
  useCreateAlbum,
  useDeleteAlbum,
  useDeleteAssets,
  useCreateTag,
  useDeleteTag,
  polaroidKeys,
} from '@/hooks/usePolaroid';
import * as polaroidApi from '@/lib/api/polaroid';

vi.mock('@/lib/api/polaroid', () => ({
  getServerInfo: vi.fn(),
  getAssets: vi.fn(),
  getAsset: vi.fn(),
  getAssetStatistics: vi.fn(),
  uploadAsset: vi.fn(),
  deleteAssets: vi.fn(),
  checkExistingAssets: vi.fn(),
  downloadAsset: vi.fn(),
  getTimeBuckets: vi.fn(),
  getTimeBucket: vi.fn(),
  getAlbums: vi.fn(),
  getAlbum: vi.fn(),
  createAlbum: vi.fn(),
  updateAlbum: vi.fn(),
  deleteAlbum: vi.fn(),
  addAssetsToAlbum: vi.fn(),
  removeAssetsFromAlbum: vi.fn(),
  getPeople: vi.fn(),
  getPerson: vi.fn(),
  updatePerson: vi.fn(),
  mergePeople: vi.fn(),
  searchMetadata: vi.fn(),
  searchSmart: vi.fn(),
  getMapMarkers: vi.fn(),
  reverseGeocode: vi.fn(),
  getSharedLinks: vi.fn(),
  getSharedLink: vi.fn(),
  createSharedLink: vi.fn(),
  updateSharedLink: vi.fn(),
  deleteSharedLink: vi.fn(),
  getTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  tagAssets: vi.fn(),
  untagAssets: vi.fn(),
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
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
  assetCount: 2,
  owner: { id: 'owner-1', email: 'owner@test.com', name: 'Owner' },
};

const mockServerInfo: polaroidApi.PolaroidServerInfo = {
  photos: 100,
  videos: 10,
  usage: 1073741824,
  usageByUser: [],
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

describe('usePolaroid hooks', () => {
  let queryClient: QueryClient;

  function createWrapper() {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    };
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  describe('polaroidKeys', () => {
    it('should generate correct base key', () => {
      expect(polaroidKeys.all).toEqual(['polaroid']);
    });

    it('should generate asset keys', () => {
      expect(polaroidKeys.assets()).toEqual(['polaroid', 'assets']);
      expect(polaroidKeys.assetsList()).toEqual(['polaroid', 'assets', 'list', undefined]);
      expect(polaroidKeys.assetsList({ skip: 0 })).toEqual(['polaroid', 'assets', 'list', { skip: 0 }]);
      expect(polaroidKeys.asset('abc')).toEqual(['polaroid', 'assets', 'detail', 'abc']);
      expect(polaroidKeys.assetStatistics()).toEqual(['polaroid', 'assets', 'statistics']);
    });

    it('should generate album keys', () => {
      expect(polaroidKeys.albums()).toEqual(['polaroid', 'albums']);
      expect(polaroidKeys.albumsList()).toEqual(['polaroid', 'albums', 'list', undefined]);
      expect(polaroidKeys.albumsList(true)).toEqual(['polaroid', 'albums', 'list', true]);
      expect(polaroidKeys.album('album-1')).toEqual(['polaroid', 'albums', 'detail', 'album-1']);
    });

    it('should generate people keys', () => {
      expect(polaroidKeys.people()).toEqual(['polaroid', 'people']);
      expect(polaroidKeys.peopleList()).toEqual(['polaroid', 'people', 'list', undefined]);
      expect(polaroidKeys.person('person-1')).toEqual(['polaroid', 'people', 'detail', 'person-1']);
    });

    it('should generate timeline keys', () => {
      expect(polaroidKeys.timeline()).toEqual(['polaroid', 'timeline']);
      expect(polaroidKeys.timeBuckets()).toEqual(['polaroid', 'timeline', 'buckets', undefined]);
      expect(polaroidKeys.timeBucket()).toEqual(['polaroid', 'timeline', 'bucket', undefined]);
    });

    it('should generate tag and api-key keys', () => {
      expect(polaroidKeys.tags()).toEqual(['polaroid', 'tags']);
      expect(polaroidKeys.apiKeys()).toEqual(['polaroid', 'api-keys']);
    });

    it('should generate shared link keys', () => {
      expect(polaroidKeys.sharedLinks()).toEqual(['polaroid', 'shared-links']);
      expect(polaroidKeys.sharedLink('link-1')).toEqual(['polaroid', 'shared-links', 'detail', 'link-1']);
    });

    it('should generate server keys', () => {
      expect(polaroidKeys.server()).toEqual(['polaroid', 'server']);
      expect(polaroidKeys.serverInfo()).toEqual(['polaroid', 'server', 'info']);
    });

    it('should generate map keys', () => {
      expect(polaroidKeys.map()).toEqual(['polaroid', 'map']);
      expect(polaroidKeys.mapMarkers()).toEqual(['polaroid', 'map', 'markers', undefined]);
      expect(polaroidKeys.mapMarkers({ isFavorite: true })).toEqual(['polaroid', 'map', 'markers', { isFavorite: true }]);
    });
  });

  describe('useServerInfo', () => {
    it('should fetch server info', async () => {
      vi.mocked(polaroidApi.getServerInfo).mockResolvedValue(mockServerInfo);

      const { result } = renderHook(() => useServerInfo(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(polaroidApi.getServerInfo).toHaveBeenCalled();
      expect(result.current.data).toEqual(mockServerInfo);
    });
  });

  describe('useAssets', () => {
    it('should fetch assets list', async () => {
      vi.mocked(polaroidApi.getAssets).mockResolvedValue([mockAsset]);

      const { result } = renderHook(() => useAssets(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(polaroidApi.getAssets).toHaveBeenCalledWith(undefined);
      expect(result.current.data).toEqual([mockAsset]);
    });

    it('should pass filter params', async () => {
      vi.mocked(polaroidApi.getAssets).mockResolvedValue([]);
      const params = { isFavorite: true, take: 10 };

      const { result } = renderHook(() => useAssets(params), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(polaroidApi.getAssets).toHaveBeenCalledWith(params);
    });
  });

  describe('useAsset', () => {
    it('should fetch asset by id', async () => {
      vi.mocked(polaroidApi.getAsset).mockResolvedValue(mockAsset);

      const { result } = renderHook(() => useAsset('asset-123'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(polaroidApi.getAsset).toHaveBeenCalledWith('asset-123');
      expect(result.current.data).toEqual(mockAsset);
    });

    it('should not fetch when id is empty', () => {
      renderHook(() => useAsset(''), { wrapper: createWrapper() });

      expect(polaroidApi.getAsset).not.toHaveBeenCalled();
    });
  });

  describe('useAlbums', () => {
    it('should fetch all albums', async () => {
      vi.mocked(polaroidApi.getAlbums).mockResolvedValue([mockAlbum]);

      const { result } = renderHook(() => useAlbums(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(polaroidApi.getAlbums).toHaveBeenCalledWith(undefined);
      expect(result.current.data).toEqual([mockAlbum]);
    });

    it('should pass shared filter', async () => {
      vi.mocked(polaroidApi.getAlbums).mockResolvedValue([]);

      const { result } = renderHook(() => useAlbums(true), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(polaroidApi.getAlbums).toHaveBeenCalledWith(true);
    });
  });

  describe('useAlbum', () => {
    it('should fetch album by id', async () => {
      vi.mocked(polaroidApi.getAlbum).mockResolvedValue(mockAlbum);

      const { result } = renderHook(() => useAlbum('album-123'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(polaroidApi.getAlbum).toHaveBeenCalledWith('album-123');
      expect(result.current.data).toEqual(mockAlbum);
    });

    it('should not fetch when id is empty', () => {
      renderHook(() => useAlbum(''), { wrapper: createWrapper() });

      expect(polaroidApi.getAlbum).not.toHaveBeenCalled();
    });
  });

  describe('usePeople', () => {
    it('should fetch people list', async () => {
      const mockResponse = { people: [], total: 0, hasNextPage: false };
      vi.mocked(polaroidApi.getPeople).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => usePeople(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(polaroidApi.getPeople).toHaveBeenCalledWith(undefined);
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should pass params', async () => {
      vi.mocked(polaroidApi.getPeople).mockResolvedValue({ people: [], total: 0, hasNextPage: false });
      const params = { withHidden: true };

      const { result } = renderHook(() => usePeople(params), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(polaroidApi.getPeople).toHaveBeenCalledWith(params);
    });
  });

  describe('useTags', () => {
    it('should fetch tags list', async () => {
      vi.mocked(polaroidApi.getTags).mockResolvedValue([mockTag]);

      const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(polaroidApi.getTags).toHaveBeenCalled();
      expect(result.current.data).toEqual([mockTag]);
    });
  });

  describe('useApiKeys', () => {
    it('should fetch API keys list', async () => {
      vi.mocked(polaroidApi.getApiKeys).mockResolvedValue([mockApiKey]);

      const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(polaroidApi.getApiKeys).toHaveBeenCalled();
      expect(result.current.data).toEqual([mockApiKey]);
    });
  });

  describe('useCreateAlbum', () => {
    it('should create an album', async () => {
      const createData = { albumName: 'New Album', description: 'Created in test' };
      vi.mocked(polaroidApi.createAlbum).mockResolvedValue(mockAlbum);

      const { result } = renderHook(() => useCreateAlbum(), { wrapper: createWrapper() });

      await result.current.mutateAsync(createData);

      expect(polaroidApi.createAlbum).toHaveBeenCalledWith(createData);
    });
  });

  describe('useDeleteAlbum', () => {
    it('should delete an album', async () => {
      vi.mocked(polaroidApi.deleteAlbum).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteAlbum(), { wrapper: createWrapper() });

      await result.current.mutateAsync('album-123');

      expect(polaroidApi.deleteAlbum).toHaveBeenCalledWith('album-123');
    });
  });

  describe('useDeleteAssets', () => {
    it('should delete assets', async () => {
      vi.mocked(polaroidApi.deleteAssets).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteAssets(), { wrapper: createWrapper() });

      await result.current.mutateAsync({ ids: ['asset-1', 'asset-2'] });

      expect(polaroidApi.deleteAssets).toHaveBeenCalledWith(['asset-1', 'asset-2'], undefined);
    });

    it('should pass force flag', async () => {
      vi.mocked(polaroidApi.deleteAssets).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteAssets(), { wrapper: createWrapper() });

      await result.current.mutateAsync({ ids: ['asset-1'], force: true });

      expect(polaroidApi.deleteAssets).toHaveBeenCalledWith(['asset-1'], true);
    });
  });

  describe('useCreateTag', () => {
    it('should create a tag', async () => {
      const createData = { name: 'vacation' };
      vi.mocked(polaroidApi.createTag).mockResolvedValue(mockTag);

      const { result } = renderHook(() => useCreateTag(), { wrapper: createWrapper() });

      await result.current.mutateAsync(createData);

      expect(polaroidApi.createTag).toHaveBeenCalledWith(createData);
    });
  });

  describe('useDeleteTag', () => {
    it('should delete a tag', async () => {
      vi.mocked(polaroidApi.deleteTag).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteTag(), { wrapper: createWrapper() });

      await result.current.mutateAsync('tag-1');

      expect(polaroidApi.deleteTag).toHaveBeenCalledWith('tag-1');
    });
  });
});
