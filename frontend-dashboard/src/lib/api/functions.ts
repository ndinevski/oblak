/**
 * Functions API Client
 * API client for function CRUD operations and invocation
 */

import { apiClient } from './client';
import { ApiResponse, PaginatedResponse, PaginationParams } from './types';

/**
 * Function runtime options
 */
export type FunctionRuntime = 
  | 'nodejs20' 
  | 'nodejs18' 
  | 'python312' 
  | 'python311' 
  | 'python310'
  | 'dotnet8'
  | 'dotnet7';

/**
 * Function status
 */
export type FunctionStatus = 'active' | 'inactive' | 'error' | 'deploying';

/**
 * Function data from API
 */
export interface FunctionData {
  id: number;
  documentId: string;
  name: string;
  description?: string;
  runtime: FunctionRuntime;
  handler: string;
  code?: string;
  memoryMB: number;
  timeoutSec: number;
  environment: Record<string, string>;
  tags: string[];
  status: FunctionStatus;
  invocationCount: string; // bigint as string
  createdAt: string;
  updatedAt: string;
}

/**
 * Create function request
 */
export interface CreateFunctionRequest {
  name: string;
  description?: string;
  runtime: FunctionRuntime;
  handler?: string;
  code: string;
  memoryMB?: number;
  timeoutSec?: number;
  environment?: Record<string, string>;
  tags?: string[];
}

/**
 * Update function request
 */
export interface UpdateFunctionRequest {
  name?: string;
  description?: string;
  runtime?: FunctionRuntime;
  handler?: string;
  code?: string;
  memoryMB?: number;
  timeoutSec?: number;
  environment?: Record<string, string>;
  tags?: string[];
}

/**
 * Function invocation request
 */
export interface InvokeFunctionRequest {
  payload?: Record<string, unknown>;
}

/**
 * Function invocation response
 */
export interface InvokeFunctionResponse {
  result: unknown;
  execution_time_ms: number;
  memory_used_mb?: number;
  logs?: string[];
}

/**
 * Function list filters
 */
export interface FunctionFilters {
  runtime?: FunctionRuntime;
  status?: FunctionStatus;
  search?: string;
}

/**
 * Functions API client
 */
export const functionsApi = {
  /**
   * Get all functions for current user
   */
  async list(
    params?: PaginationParams & FunctionFilters
  ): Promise<PaginatedResponse<FunctionData>> {
    const queryParams = new URLSearchParams();
    
    if (params?.page) {
      queryParams.append('pagination[page]', params.page.toString());
    }
    if (params?.pageSize) {
      queryParams.append('pagination[pageSize]', params.pageSize.toString());
    }
    if (params?.runtime) {
      queryParams.append('filters[runtime][$eq]', params.runtime);
    }
    if (params?.status) {
      queryParams.append('filters[status][$eq]', params.status);
    }
    if (params?.search) {
      queryParams.append('filters[name][$containsi]', params.search);
    }
    
    // Sort by most recent first
    queryParams.append('sort', 'createdAt:desc');
    
    const query = queryParams.toString();
    const url = `/functions${query ? `?${query}` : ''}`;
    
    const response = await apiClient.get<PaginatedResponse<FunctionData>>(url);
    return response.data;
  },

  /**
   * Get a single function by ID
   */
  async getById(id: number | string): Promise<ApiResponse<FunctionData>> {
    const response = await apiClient.get<ApiResponse<FunctionData>>(
      `/functions/${id}`
    );
    return response.data;
  },

  /**
   * Get a function by name
   */
  async getByName(name: string): Promise<ApiResponse<FunctionData>> {
    const response = await apiClient.get<ApiResponse<FunctionData>>(
      `/functions/name/${name}`
    );
    return response.data;
  },

  /**
   * Create a new function
   */
  async create(data: CreateFunctionRequest): Promise<ApiResponse<FunctionData>> {
    const response = await apiClient.post<ApiResponse<FunctionData>>(
      '/functions',
      { data }
    );
    return response.data;
  },

  /**
   * Update an existing function
   */
  async update(
    id: number | string, 
    data: UpdateFunctionRequest
  ): Promise<ApiResponse<FunctionData>> {
    const response = await apiClient.put<ApiResponse<FunctionData>>(
      `/functions/${id}`,
      { data }
    );
    return response.data;
  },

  /**
   * Delete a function
   */
  async delete(id: number | string): Promise<void> {
    await apiClient.delete(`/functions/${id}`);
  },

  /**
   * Invoke a function
   */
  async invoke(
    id: number | string, 
    request?: InvokeFunctionRequest
  ): Promise<InvokeFunctionResponse> {
    const response = await apiClient.post<InvokeFunctionResponse>(
      `/functions/${id}/invoke`,
      request?.payload || {}
    );
    return response.data;
  },

  /**
   * Get function count for current user
   */
  async count(): Promise<number> {
    const response = await apiClient.get<{ count: number }>('/functions/count');
    return response.data.count;
  },
};

export default functionsApi;
