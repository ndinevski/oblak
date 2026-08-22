/**
 * Storage Hooks
 * React Query hooks for bucket and object operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as storageApi from '@/lib/api/storage';
import type {
  Bucket,
  StorageObject,
  ObjectList,
  BucketStats,
  CreateBucketRequest,
  UpdateBucketRequest,
  UploadObjectRequest,
  CopyObjectRequest,
  PresignedUrlRequest,
  PresignedUrl,
  QuotaUsage,
  BucketAccessCredentials,
} from '@/lib/api/storage';

// =============================================================================
// Query Keys Factory
// =============================================================================

export const storageKeys = {
  all: ['storage'] as const,
  buckets: () => [...storageKeys.all, 'buckets'] as const,
  bucketsList: (params?: { page?: number; pageSize?: number; sort?: string }) =>
    [...storageKeys.buckets(), 'list', params] as const,
  bucket: (id: number) => [...storageKeys.buckets(), 'detail', id] as const,
  bucketStats: (id: number) => [...storageKeys.bucket(id), 'stats'] as const,
  objects: (bucketId: number) => [...storageKeys.bucket(bucketId), 'objects'] as const,
  objectsList: (bucketId: number, params?: { prefix?: string; delimiter?: string; marker?: string }) =>
    [...storageKeys.objects(bucketId), 'list', params] as const,
  object: (bucketId: number, key: string) => [...storageKeys.objects(bucketId), key] as const,
  quota: () => [...storageKeys.all, 'quota'] as const,
};

// =============================================================================
// Bucket Query Hooks
// =============================================================================

export function useBuckets(params?: { page?: number; pageSize?: number; sort?: string }) {
  return useQuery({
    queryKey: storageKeys.bucketsList(params),
    queryFn: () => storageApi.listBuckets(params),
  });
}

export function useBucket(id: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: storageKeys.bucket(id),
    queryFn: () => storageApi.getBucket(id),
    enabled: options?.enabled !== false && id > 0,
  });
}

export function useBucketStats(id: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: storageKeys.bucketStats(id),
    queryFn: () => storageApi.getBucketStats(id),
    enabled: options?.enabled !== false && id > 0,
  });
}

export function useQuotaUsage() {
  return useQuery({
    queryKey: storageKeys.quota(),
    queryFn: () => storageApi.getQuotaUsage(),
  });
}

// =============================================================================
// Object Query Hooks
// =============================================================================

export function useObjects(
  bucketId: number,
  params?: { prefix?: string; delimiter?: string; marker?: string; maxKeys?: number },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: storageKeys.objectsList(bucketId, params),
    queryFn: () => storageApi.listObjects(bucketId, params),
    enabled: options?.enabled !== false && bucketId > 0,
  });
}

export function useObjectInfo(bucketId: number, key: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: storageKeys.object(bucketId, key),
    queryFn: () => storageApi.getObjectInfo(bucketId, key),
    enabled: options?.enabled !== false && bucketId > 0 && Boolean(key),
  });
}

// =============================================================================
// Bucket Mutation Hooks
// =============================================================================

export function useCreateBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBucketRequest) => storageApi.createBucket(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.buckets() });
      queryClient.invalidateQueries({ queryKey: storageKeys.quota() });
    },
  });
}

export function useUpdateBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateBucketRequest }) =>
      storageApi.updateBucket(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: storageKeys.bucket(id) });
      queryClient.invalidateQueries({ queryKey: storageKeys.buckets() });
    },
  });
}

export function useDeleteBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      storageApi.deleteBucket(id, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.buckets() });
      queryClient.invalidateQueries({ queryKey: storageKeys.quota() });
    },
  });
}

export function useSyncBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => storageApi.syncBucket(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: storageKeys.bucket(id) });
    },
  });
}

// =============================================================================
// Object Mutation Hooks
// =============================================================================

export function useUploadObject(bucketId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UploadObjectRequest) => storageApi.uploadObject(bucketId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.objects(bucketId) });
      queryClient.invalidateQueries({ queryKey: storageKeys.bucketStats(bucketId) });
      queryClient.invalidateQueries({ queryKey: storageKeys.bucket(bucketId) });
    },
  });
}

export function useDeleteObject(bucketId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (key: string) => storageApi.deleteObject(bucketId, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.objects(bucketId) });
      queryClient.invalidateQueries({ queryKey: storageKeys.bucketStats(bucketId) });
      queryClient.invalidateQueries({ queryKey: storageKeys.bucket(bucketId) });
    },
  });
}

export function useDeleteObjects(bucketId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keys: string[]) => storageApi.deleteObjects(bucketId, keys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.objects(bucketId) });
      queryClient.invalidateQueries({ queryKey: storageKeys.bucketStats(bucketId) });
      queryClient.invalidateQueries({ queryKey: storageKeys.bucket(bucketId) });
    },
  });
}

export function useDeleteFolder(bucketId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (prefix: string) => storageApi.deleteFolder(bucketId, prefix),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.objects(bucketId) });
      queryClient.invalidateQueries({ queryKey: storageKeys.bucketStats(bucketId) });
      queryClient.invalidateQueries({ queryKey: storageKeys.bucket(bucketId) });
    },
  });
}

export function useCopyObject(bucketId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CopyObjectRequest) => storageApi.copyObject(bucketId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.objects(bucketId) });
      queryClient.invalidateQueries({ queryKey: storageKeys.bucketStats(bucketId) });
    },
  });
}

export function usePresignedUrl(bucketId: number) {
  return useMutation({
    mutationFn: (data: PresignedUrlRequest) => storageApi.getPresignedUrl(bucketId, data),
  });
}

export function useIssueBucketAccessCredentials(bucketId: number) {
  return useMutation({
    mutationFn: (readWrite = true): Promise<BucketAccessCredentials> =>
      storageApi.issueBucketAccessCredentials(bucketId, readWrite),
  });
}

// =============================================================================
// Download Hook (uses blob download)
// =============================================================================

export function useDownloadObject(bucketId: number) {
  return useMutation({
    mutationFn: async (key: string) => {
      const blob = await storageApi.downloadObject(bucketId, key);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = storageApi.getFileName(key);
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      return { key };
    },
  });
}

// =============================================================================
// File Upload Helper Hook
// =============================================================================

export function useFileUpload(bucketId: number) {
  const uploadMutation = useUploadObject(bucketId);

  const uploadFile = async (file: File, prefix = ''): Promise<StorageObject> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          const key = prefix ? `${prefix}/${file.name}` : file.name;
          const resolvedContentType = file.type || storageApi.getContentType(file.name);
          const result = await uploadMutation.mutateAsync({
            key,
            data: base64,
            contentType: resolvedContentType,
            metadata: {
              original_filename: file.name,
              original_content_type: resolvedContentType,
            },
          });
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const uploadFiles = async (files: File[], prefix = ''): Promise<StorageObject[]> => {
    const results: StorageObject[] = [];
    for (const file of files) {
      const result = await uploadFile(file, prefix);
      results.push(result);
    }
    return results;
  };

  return {
    uploadFile,
    uploadFiles,
    isUploading: uploadMutation.isPending,
    error: uploadMutation.error,
    reset: uploadMutation.reset,
  };
}

// =============================================================================
// Folder Navigation Hook
// =============================================================================

export function useFolderNavigation(bucketId: number, initialPrefix = '') {
  const [currentPrefix, setCurrentPrefix] = React.useState(initialPrefix);
  
  const { data, isLoading, error, refetch } = useObjects(bucketId, {
    prefix: currentPrefix,
    delimiter: '/',
  });

  const navigateToFolder = (folder: string) => {
    setCurrentPrefix(folder);
  };

  const navigateUp = () => {
    if (!currentPrefix) return;
    const parts = currentPrefix.split('/').filter(Boolean);
    parts.pop();
    setCurrentPrefix(parts.length ? parts.join('/') + '/' : '');
  };

  const navigateToRoot = () => {
    setCurrentPrefix('');
  };

  const breadcrumbs = React.useMemo(() => {
    if (!currentPrefix) return [];
    const parts = currentPrefix.split('/').filter(Boolean);
    return parts.map((part, index) => ({
      name: part,
      path: parts.slice(0, index + 1).join('/') + '/',
    }));
  }, [currentPrefix]);

  return {
    currentPrefix,
    objects: data?.objects || [],
    folders: data?.commonPrefixes || [],
    isTruncated: data?.isTruncated || false,
    nextMarker: data?.nextMarker,
    isLoading,
    error,
    refetch,
    navigateToFolder,
    navigateUp,
    navigateToRoot,
    breadcrumbs,
    canNavigateUp: Boolean(currentPrefix),
  };
}

// Need to import React for hooks
import * as React from 'react';
