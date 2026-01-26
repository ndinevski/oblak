import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Query keys for cache management
export const queryKeys = {
  // Auth
  auth: ['auth'] as const,
  user: () => [...queryKeys.auth, 'user'] as const,
  
  // Impuls (Functions)
  functions: ['functions'] as const,
  functionsList: () => [...queryKeys.functions, 'list'] as const,
  functionDetail: (id: string) => [...queryKeys.functions, 'detail', id] as const,
  functionLogs: (id: string) => [...queryKeys.functions, 'logs', id] as const,
  
  // Izvor (VMs)
  vms: ['vms'] as const,
  vmsList: () => [...queryKeys.vms, 'list'] as const,
  vmDetail: (id: string) => [...queryKeys.vms, 'detail', id] as const,
  vmMetrics: (id: string) => [...queryKeys.vms, 'metrics', id] as const,
  
  // Spomen (Storage)
  buckets: ['buckets'] as const,
  bucketsList: () => [...queryKeys.buckets, 'list'] as const,
  bucketDetail: (id: string) => [...queryKeys.buckets, 'detail', id] as const,
  bucketObjects: (id: string) => [...queryKeys.buckets, 'objects', id] as const,
  
  // Dashboard
  dashboard: ['dashboard'] as const,
  overview: () => [...queryKeys.dashboard, 'overview'] as const,
  activity: () => [...queryKeys.dashboard, 'activity'] as const,
};

// Helper type for query options
export type QueryOptions<T> = {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number | false;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
};

// Helper to invalidate related queries
export function useInvalidateQueries() {
  const queryClient = useQueryClient();
  
  return {
    invalidateFunctions: () => queryClient.invalidateQueries({ queryKey: queryKeys.functions }),
    invalidateVMs: () => queryClient.invalidateQueries({ queryKey: queryKeys.vms }),
    invalidateBuckets: () => queryClient.invalidateQueries({ queryKey: queryKeys.buckets }),
    invalidateDashboard: () => queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
    invalidateAll: () => queryClient.invalidateQueries(),
  };
}

export { useQuery, useMutation, useQueryClient };
