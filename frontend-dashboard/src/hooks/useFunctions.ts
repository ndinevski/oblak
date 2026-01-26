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
    onSuccess: (result) => {
      // Update the cache for this specific function
      queryClient.setQueryData(
        functionKeys.detail(result.data.id), 
        result
      );
      // Invalidate lists to refetch
      queryClient.invalidateQueries({ queryKey: functionKeys.lists() });
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
    onSuccess: (_, { id }) => {
      // Invalidate the function detail to refetch updated invocationCount
      queryClient.invalidateQueries({ queryKey: functionKeys.detail(id) });
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
