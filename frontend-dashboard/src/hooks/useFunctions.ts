/**
 * Functions Hooks
 * TanStack Query hooks for function operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  functionsApi, 
  FunctionData, 
  FunctionRuntime,
  FunctionStatus,
  CreateFunctionRequest, 
  UpdateFunctionRequest,
  FunctionFilters,
  InvokeFunctionRequest,
  InvokeFunctionResponse,
  FunctionLogsResponse,
  LogRetentionPolicy,
} from '@/lib/api/functions';
import { PaginationParams } from '@/lib/api/types';

/**
 * Query key factory for functions
 */
export const functionKeys = {
  all: ['functions'] as const,
  lists: () => [...functionKeys.all, 'list'] as const,
  list: (filters?: PaginationParams & FunctionFilters) => 
    [...functionKeys.lists(), filters] as const,
  details: () => [...functionKeys.all, 'detail'] as const,
  detail: (id: number | string) => [...functionKeys.details(), id] as const,
  logs: () => [...functionKeys.all, 'logs'] as const,
  log: (id: number | string) => [...functionKeys.logs(), id] as const,
  logsRetention: () => [...functionKeys.all, 'logs-retention'] as const,
  byName: (name: string) => [...functionKeys.all, 'name', name] as const,
  count: () => [...functionKeys.all, 'count'] as const,
};

/**
 * Hook to fetch paginated list of functions
 */
export function useFunctions(params?: PaginationParams & FunctionFilters) {
  return useQuery({
    queryKey: functionKeys.list(params),
    queryFn: () => functionsApi.list(params),
    refetchOnMount: 'always',
  });
}

/**
 * Hook to fetch a single function by ID
 */
export function useFunction(id: number | string | undefined) {
  return useQuery({
    queryKey: functionKeys.detail(id!),
    queryFn: () => functionsApi.getById(id!),
    enabled: !!id,
    refetchOnMount: 'always',
    select: (data) => data.data,
  });
}

/**
 * Hook to fetch a function by name
 */
export function useFunctionByName(name: string | undefined) {
  return useQuery({
    queryKey: functionKeys.byName(name!),
    queryFn: () => functionsApi.getByName(name!),
    enabled: !!name,
    select: (data) => data.data,
  });
}

/**
 * Hook to get function count
 */
export function useFunctionCount() {
  return useQuery({
    queryKey: functionKeys.count(),
    queryFn: () => functionsApi.count(),
  });
}

/**
 * Hook to create a new function
 */
export function useCreateFunction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateFunctionRequest) => functionsApi.create(data),
    onSuccess: () => {
      // Invalidate all function queries
      queryClient.invalidateQueries({ queryKey: functionKeys.all });
    },
  });
}

/**
 * Hook to update a function
 */
export function useUpdateFunction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number | string; data: UpdateFunctionRequest }) => 
      functionsApi.update(id, data),
    onSuccess: () => {
      // Invalidate all function queries to guarantee fresh state across pages.
      queryClient.invalidateQueries({ queryKey: functionKeys.all });
    },
  });
}

/**
 * Hook to delete a function
 */
export function useDeleteFunction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number | string) => functionsApi.delete(id),
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: functionKeys.detail(id) });
      // Invalidate all function queries
      queryClient.invalidateQueries({ queryKey: functionKeys.all });
    },
  });
}

/**
 * Hook to invoke a function
 */
export function useInvokeFunction() {
  const queryClient = useQueryClient();
  
  return useMutation<
    InvokeFunctionResponse, 
    Error, 
    { id: number | string; request?: InvokeFunctionRequest }
  >({
    mutationFn: ({ id, request }) => functionsApi.invoke(id, request),
    onSuccess: () => {
      // Invalidate all function queries so list/detail/count stay in sync.
      queryClient.invalidateQueries({ queryKey: functionKeys.all });
    },
  });
}

/**
 * Hook to set function status (activate/deactivate)
 */
export function useSetFunctionStatus() {
  const queryClient = useQueryClient();

  return useMutation<
    { data: FunctionData },
    Error,
    { id: number | string; status: FunctionStatus }
  >({
    mutationFn: ({ id, status }) => functionsApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: functionKeys.all });
    },
  });
}

/**
 * Hook to fetch recent invocation logs for a function
 */
export function useFunctionLogs(id: number | string | undefined, limit = 25) {
  return useQuery<FunctionLogsResponse>({
    queryKey: functionKeys.log(id!),
    queryFn: () => functionsApi.getLogs(id!, limit),
    enabled: !!id,
    refetchInterval: 10000,
  });
}

/**
 * Hook to fetch logs retention policy
 */
export function useFunctionLogsRetention() {
  return useQuery<LogRetentionPolicy>({
    queryKey: functionKeys.logsRetention(),
    queryFn: () => functionsApi.getLogsRetentionPolicy(),
  });
}

/**
 * Hook to update logs retention policy
 */
export function useUpdateFunctionLogsRetention() {
  const queryClient = useQueryClient();

  return useMutation<
    LogRetentionPolicy,
    Error,
    { useCustomRetention: boolean; customRetentionDays?: number }
  >({
    mutationFn: (payload) => functionsApi.updateLogsRetentionPolicy(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: functionKeys.logsRetention() });
      queryClient.invalidateQueries({ queryKey: functionKeys.logs() });
    },
  });
}

/**
 * Types for external use
 */
export type { 
  FunctionData, 
  CreateFunctionRequest, 
  UpdateFunctionRequest, 
  FunctionFilters,
  FunctionRuntime,
  FunctionStatus,
};
