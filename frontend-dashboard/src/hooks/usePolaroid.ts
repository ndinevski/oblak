/**
 * Polaroid Hooks
 * React Query hooks for photo management operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import * as polaroidApi from '@/lib/api/polaroid';

// =============================================================================
// Query Keys Factory
// =============================================================================

export const polaroidKeys = {
  all: ['polaroid'] as const,
  assets: () => [...polaroidKeys.all, 'assets'] as const,
  assetsList: (params?: object) => [...polaroidKeys.assets(), 'list', params] as const,
  asset: (id: string) => [...polaroidKeys.assets(), 'detail', id] as const,
  assetStatistics: () => [...polaroidKeys.assets(), 'statistics'] as const,
  timeline: () => [...polaroidKeys.all, 'timeline'] as const,
  timeBuckets: (params?: object) => [...polaroidKeys.timeline(), 'buckets', params] as const,
  timeBucket: (params?: object) => [...polaroidKeys.timeline(), 'bucket', params] as const,
  albums: () => [...polaroidKeys.all, 'albums'] as const,
  albumsList: (shared?: boolean) => [...polaroidKeys.albums(), 'list', shared] as const,
  album: (id: string) => [...polaroidKeys.albums(), 'detail', id] as const,
  people: () => [...polaroidKeys.all, 'people'] as const,
  peopleList: (params?: object) => [...polaroidKeys.people(), 'list', params] as const,
  person: (id: string) => [...polaroidKeys.people(), 'detail', id] as const,
  search: () => [...polaroidKeys.all, 'search'] as const,
  map: () => [...polaroidKeys.all, 'map'] as const,
  mapMarkers: (params?: object) => [...polaroidKeys.map(), 'markers', params] as const,
  sharedLinks: () => [...polaroidKeys.all, 'shared-links'] as const,
  sharedLink: (id: string) => [...polaroidKeys.sharedLinks(), 'detail', id] as const,
  tags: () => [...polaroidKeys.all, 'tags'] as const,
  apiKeys: () => [...polaroidKeys.all, 'api-keys'] as const,
  server: () => [...polaroidKeys.all, 'server'] as const,
  serverInfo: () => [...polaroidKeys.server(), 'info'] as const,
};

// =============================================================================
// Server Query Hooks
// =============================================================================

export function useServerInfo() {
  return useQuery({
    queryKey: polaroidKeys.serverInfo(),
    queryFn: () => polaroidApi.getServerInfo(),
  });
}

// =============================================================================
// Asset Query Hooks
// =============================================================================

export function useAssets(params?: {
  skip?: number;
  take?: number;
  order?: 'asc' | 'desc';
  isFavorite?: boolean;
  isArchived?: boolean;
  visibility?: 'timeline' | 'archive' | 'hidden';
  isTrashed?: boolean;
}) {
  return useQuery({
    queryKey: polaroidKeys.assetsList(params),
    queryFn: () => polaroidApi.getAssets(params),
  });
}

export function useAsset(assetId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: polaroidKeys.asset(assetId),
    queryFn: () => polaroidApi.getAsset(assetId),
    enabled: options?.enabled !== false && Boolean(assetId),
  });
}

export function useAssetStatistics() {
  return useQuery({
    queryKey: polaroidKeys.assetStatistics(),
    queryFn: () => polaroidApi.getAssetStatistics(),
  });
}

// =============================================================================
// Timeline Query Hooks
// =============================================================================

export function useTimeBuckets(
  params: {
    size?: string;
    userId?: string;
    albumId?: string;
    personId?: string;
    isArchived?: boolean;
    visibility?: 'timeline' | 'archive' | 'hidden';
    isFavorite?: boolean;
    isTrashed?: boolean;
    withStacked?: boolean;
  },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: polaroidKeys.timeBuckets(params),
    queryFn: () => polaroidApi.getTimeBuckets(params),
    enabled: options?.enabled !== false,
  });
}

export function useTimeBucket(
  params: {
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
  },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: polaroidKeys.timeBucket(params),
    queryFn: () => polaroidApi.getTimeBucket(params),
    enabled: options?.enabled !== false && Boolean(params.timeBucket),
  });
}

// =============================================================================
// Album Query Hooks
// =============================================================================

export function useAlbums(shared?: boolean) {
  return useQuery({
    queryKey: polaroidKeys.albumsList(shared),
    queryFn: () => polaroidApi.getAlbums(shared),
  });
}

export function useAlbum(albumId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: polaroidKeys.album(albumId),
    queryFn: () => polaroidApi.getAlbum(albumId),
    enabled: options?.enabled !== false && Boolean(albumId),
  });
}

// =============================================================================
// People Query Hooks
// =============================================================================

export function usePeople(
  params?: { withHidden?: boolean; page?: number; size?: number },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: polaroidKeys.peopleList(params),
    queryFn: () => polaroidApi.getPeople(params),
    enabled: options?.enabled !== false,
  });
}

export function usePerson(personId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: polaroidKeys.person(personId),
    queryFn: () => polaroidApi.getPerson(personId),
    enabled: options?.enabled !== false && Boolean(personId),
  });
}

// =============================================================================
// Map Query Hooks
// =============================================================================

export function useMapMarkers(
  params?: {
    isArchived?: boolean;
    visibility?: 'timeline' | 'archive' | 'hidden';
    isFavorite?: boolean;
    fileCreatedAfter?: string;
    fileCreatedBefore?: string;
    withPartners?: boolean;
  },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: polaroidKeys.mapMarkers(params),
    queryFn: () => polaroidApi.getMapMarkers(params),
    enabled: options?.enabled !== false,
  });
}

// =============================================================================
// Shared Links Query Hooks
// =============================================================================

export function useSharedLinks() {
  return useQuery({
    queryKey: polaroidKeys.sharedLinks(),
    queryFn: () => polaroidApi.getSharedLinks(),
  });
}

export function useSharedLink(linkId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: polaroidKeys.sharedLink(linkId),
    queryFn: () => polaroidApi.getSharedLink(linkId),
    enabled: options?.enabled !== false && Boolean(linkId),
  });
}

// =============================================================================
// Tags Query Hooks
// =============================================================================

export function useTags() {
  return useQuery({
    queryKey: polaroidKeys.tags(),
    queryFn: () => polaroidApi.getTags(),
  });
}

// =============================================================================
// API Keys Query Hooks
// =============================================================================

export function useApiKeys() {
  return useQuery({
    queryKey: polaroidKeys.apiKeys(),
    queryFn: () => polaroidApi.getApiKeys(),
  });
}

// =============================================================================
// Asset Mutation Hooks
// =============================================================================

export function useUploadAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (formData: FormData) => polaroidApi.uploadAsset(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.assets() });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.assetStatistics() });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.timeline() });
    },
  });
}

export function useDeleteAssets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, force }: { ids: string[]; force?: boolean }) =>
      polaroidApi.deleteAssets(ids, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.assets() });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.assetStatistics() });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.timeline() });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.albums() });
    },
  });
}

export function useUpdateAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      assetId,
      data,
    }: {
      assetId: string;
      data: { isFavorite?: boolean; isArchived?: boolean; visibility?: 'timeline' | 'archive' | 'hidden'; description?: string; rating?: number };
    }) => polaroidApi.updateAsset(assetId, data),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.asset(assetId) });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.assets() });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.timeline() });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.albums() });
    },
  });
}

export function useRunJob() {
  return useMutation({
    mutationFn: ({
      jobName,
      command = 'start',
    }: {
      jobName: string;
      command?: 'start' | 'pause' | 'resume' | 'empty';
    }) => polaroidApi.runJob(jobName, command),
  });
}

export function useRestoreAssets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => polaroidApi.restoreAssets(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.assets() });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.assetStatistics() });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.timeline() });
    },
  });
}

// =============================================================================
// Album Mutation Hooks
// =============================================================================

export function useCreateAlbum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { albumName: string; description?: string; assetIds?: string[]; sharedUserIds?: string[] }) =>
      polaroidApi.createAlbum(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.albums() });
    },
  });
}

export function useUpdateAlbum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      albumId,
      data,
    }: {
      albumId: string;
      data: { albumName?: string; description?: string; albumThumbnailAssetId?: string };
    }) => polaroidApi.updateAlbum(albumId, data),
    onSuccess: (_, { albumId }) => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.album(albumId) });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.albums() });
    },
  });
}

export function useDeleteAlbum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (albumId: string) => polaroidApi.deleteAlbum(albumId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.albums() });
    },
  });
}

export function useAddAlbumAssets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ albumId, assetIds }: { albumId: string; assetIds: string[] }) =>
      polaroidApi.addAssetsToAlbum(albumId, assetIds),
    onSuccess: (_, { albumId }) => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.album(albumId) });
    },
  });
}

export function useRemoveAlbumAssets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ albumId, assetIds }: { albumId: string; assetIds: string[] }) =>
      polaroidApi.removeAssetsFromAlbum(albumId, assetIds),
    onSuccess: (_, { albumId }) => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.album(albumId) });
    },
  });
}

// =============================================================================
// People Mutation Hooks
// =============================================================================

export function useUpdatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      personId,
      data,
    }: {
      personId: string;
      data: { name?: string; birthDate?: string | null; isHidden?: boolean; featureFaceAssetId?: string };
    }) => polaroidApi.updatePerson(personId, data),
    onSuccess: (_, { personId }) => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.person(personId) });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.people() });
    },
  });
}

export function useMergePeople() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ personId, mergeIds }: { personId: string; mergeIds: string[] }) =>
      polaroidApi.mergePeople(personId, mergeIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.people() });
    },
  });
}

// =============================================================================
// Search Mutation Hooks
// =============================================================================

export function useSearchMetadata() {
  return useMutation({
    mutationFn: (query: Parameters<typeof polaroidApi.searchMetadata>[0]) =>
      polaroidApi.searchMetadata(query),
  });
}

export function useSearchSmart() {
  return useMutation({
    mutationFn: ({
      query,
      params,
    }: {
      query: string;
      params?: Parameters<typeof polaroidApi.searchSmart>[1];
    }) => polaroidApi.searchSmart(query, params),
  });
}

// =============================================================================
// Shared Links Mutation Hooks
// =============================================================================

export function useCreateSharedLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof polaroidApi.createSharedLink>[0]) =>
      polaroidApi.createSharedLink(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.sharedLinks() });
    },
  });
}

export function useUpdateSharedLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      linkId,
      data,
    }: {
      linkId: string;
      data: Parameters<typeof polaroidApi.updateSharedLink>[1];
    }) => polaroidApi.updateSharedLink(linkId, data),
    onSuccess: (_, { linkId }) => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.sharedLink(linkId) });
      queryClient.invalidateQueries({ queryKey: polaroidKeys.sharedLinks() });
    },
  });
}

export function useDeleteSharedLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (linkId: string) => polaroidApi.deleteSharedLink(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.sharedLinks() });
    },
  });
}

// =============================================================================
// Tags Mutation Hooks
// =============================================================================

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; value?: string }) => polaroidApi.createTag(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.tags() });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tagId, data }: { tagId: string; data: { name?: string; value?: string } }) =>
      polaroidApi.updateTag(tagId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.tags() });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tagId: string) => polaroidApi.deleteTag(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.tags() });
    },
  });
}

export function useTagAssets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tagId, assetIds }: { tagId: string; assetIds: string[] }) =>
      polaroidApi.tagAssets(tagId, assetIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.assets() });
    },
  });
}

export function useUntagAssets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tagId, assetIds }: { tagId: string; assetIds: string[] }) =>
      polaroidApi.untagAssets(tagId, assetIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.assets() });
    },
  });
}

// =============================================================================
// API Keys Mutation Hooks
// =============================================================================

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => polaroidApi.createApiKey(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.apiKeys() });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => polaroidApi.deleteApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: polaroidKeys.apiKeys() });
    },
  });
}

// =============================================================================
// Download Hook
// =============================================================================

export function useDownloadAsset() {
  return useMutation({
    mutationFn: async ({ assetId, fileName }: { assetId: string; fileName: string }) => {
      const blob = await polaroidApi.downloadAsset(assetId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      return { assetId };
    },
  });
}

// =============================================================================
// Thumbnail Hooks
// =============================================================================

export function useAssetThumbnailUrl(assetId: string | undefined, size?: string) {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (!assetId) return;
    let objectUrl: string | undefined;
    let cancelled = false;
    let attempt = 0;
    const maxRetries = 3;
    const baseDelay = 1000;

    function tryFetch() {
      polaroidApi.fetchAssetThumbnail(assetId!, size).then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }).catch(() => {
        if (cancelled) return;
        attempt++;
        if (attempt < maxRetries) {
          setTimeout(tryFetch, baseDelay * Math.pow(2, attempt - 1));
        }
      });
    }

    tryFetch();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, size]);

  return url;
}

export function usePersonThumbnailUrl(personId: string | undefined) {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (!personId) return;
    let objectUrl: string | undefined;
    let cancelled = false;

    polaroidApi.fetchPersonThumbnail(personId).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {
      // silently fail
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [personId]);

  return url;
}
