/**
 * Functions API Client
 * API client for function CRUD operations and invocation
 */

import { apiClient, API_CONFIG } from './client';
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
  status?: FunctionStatus;
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
  [key: string]: unknown;
}

export interface FunctionInvocationRuntimeLogs {
  stdout: string[];
  stderr: string[];
}

export interface FunctionInvocationLog {
  id: number;
  createdAt: string;
  status: 'success' | 'failure' | 'pending';
  errorMessage?: string;
  executionTimeMs?: number;
  providerStatusCode?: number;
  response?: unknown;
  runtimeLogs?: FunctionInvocationRuntimeLogs | null;
}

export interface FunctionLogsResponse {
  data: FunctionInvocationLog[];
  meta: {
    count: number;
    limit: number;
  };
}

export interface LogRetentionPolicy {
  defaultRetentionDays: number;
  useCustomRetention: boolean;
  customRetentionDays: number;
  effectiveRetentionDays: number;
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
  baseUrl: API_CONFIG.baseURL,

  /**
   * Get all functions for current user
   */
  async list(
    params?: PaginationParams & FunctionFilters
  ): Promise<PaginatedResponse<FunctionData>> {
    const queryParams = new URLSearchParams();
    
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.pageSize) {
      queryParams.append('pageSize', params.pageSize.toString());
    }
    if (params?.runtime) {
      queryParams.append('runtime', params.runtime);
    }
    if (params?.status) {
      queryParams.append('status', params.status);
    }
    if (params?.search) {
      queryParams.append('search', params.search);
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
    const response = await apiClient.post<ApiResponse<InvokeFunctionResponse>>(
      `/functions/${id}/invoke`,
      request?.payload || {}
    );
    return response.data.data;
  },

  /**
   * Get function count for current user
   */
  async count(): Promise<number> {
    const response = await apiClient.get<{ count: number }>('/functions/count');
    return response.data.count;
  },

  /**
   * Get recent invocation logs for a function
   */
  async getLogs(id: number | string, limit = 25): Promise<FunctionLogsResponse> {
    const response = await apiClient.get<FunctionLogsResponse>(`/functions/${id}/logs?limit=${limit}`);
    return response.data;
  },

  /**
   * Get logs retention policy
   */
  async getLogsRetentionPolicy(): Promise<LogRetentionPolicy> {
    const response = await apiClient.get<{ data: LogRetentionPolicy }>('/activity-logs/retention');
    return response.data.data;
  },

  /**
   * Update logs retention policy
   */
  async updateLogsRetentionPolicy(data: {
    useCustomRetention: boolean;
    customRetentionDays?: number;
  }): Promise<LogRetentionPolicy> {
    const response = await apiClient.put<{ data: LogRetentionPolicy }>('/activity-logs/retention', data);
    return response.data.data;
  },
};

export default functionsApi;
