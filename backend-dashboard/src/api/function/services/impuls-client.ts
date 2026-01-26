/**
 * Impuls API Client
 * HTTP client for communicating with the Impuls FaaS service
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * Impuls function data
 */
export interface ImpulsFunction {
  id: string;
  name: string;
  description?: string;
  runtime: string;
  handler: string;
  code?: string;
  memory_mb: number;
  timeout_sec: number;
  environment?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/**
 * Create function request
 */
export interface CreateFunctionRequest {
  name: string;
  description?: string;
  runtime: string;
  handler: string;
  code: string;
  memory_mb?: number;
  timeout_sec?: number;
  environment?: Record<string, string>;
}

/**
 * Update function request
 */
export interface UpdateFunctionRequest {
  description?: string;
  runtime?: string;
  handler?: string;
  code?: string;
  memory_mb?: number;
  timeout_sec?: number;
  environment?: Record<string, string>;
}

/**
 * Invoke function request
 */
export interface InvokeFunctionRequest {
  payload?: Record<string, unknown>;
  local?: boolean;
}

/**
 * Invoke function response
 */
export interface InvokeFunctionResponse {
  result: unknown;
  execution_time_ms: number;
  memory_used_mb?: number;
  logs?: string[];
}

/**
 * List functions response
 */
export interface ListFunctionsResponse {
  functions: ImpulsFunction[];
  count: number;
}

/**
 * Impuls API error
 */
export class ImpulsApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ImpulsApiError';
  }
}

/**
 * Impuls Client configuration
 */
export interface ImpulsClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
}

/**
 * Create Impuls API client
 */
export function createImpulsClient(config: ImpulsClientConfig): ImpulsClient {
  return new ImpulsClient(config);
}

/**
 * Impuls API Client class
 */
export class ImpulsClient {
  private client: AxiosInstance;
  private retries: number;

  constructor(config: ImpulsClientConfig) {
    this.retries = config.retries ?? 3;

    this.client = axios.create({
      baseURL: `${config.baseUrl}/api/v1`,
      timeout: config.timeout ?? 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {}),
      },
    });
  }

  /**
   * Execute request with retries
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on client errors (4xx)
        if (error instanceof AxiosError && error.response?.status) {
          const status = error.response.status;
          if (status >= 400 && status < 500) {
            throw this.parseError(error);
          }
        }
        
        // Wait before retry with exponential backoff
        if (attempt < this.retries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    }

    throw lastError;
  }

  /**
   * Parse Axios error into ImpulsApiError
   */
  private parseError(error: AxiosError): ImpulsApiError {
    if (error.response) {
      const data = error.response.data as { message?: string; error?: string } | undefined;
      const message = data?.message || data?.error || error.message;
      return new ImpulsApiError(message, error.response.status, data);
    }
    return new ImpulsApiError(error.message, 0);
  }

  /**
   * Check service health
   */
  async health(): Promise<{ status: string; service: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }

  /**
   * Create a new function
   */
  async createFunction(data: CreateFunctionRequest): Promise<ImpulsFunction> {
    return this.withRetry(async () => {
      const response = await this.client.post('/functions', data);
      return response.data;
    });
  }

  /**
   * List all functions
   */
  async listFunctions(): Promise<ListFunctionsResponse> {
    return this.withRetry(async () => {
      const response = await this.client.get('/functions');
      return response.data;
    });
  }

  /**
   * Get function by name
   */
  async getFunction(name: string): Promise<ImpulsFunction> {
    return this.withRetry(async () => {
      const response = await this.client.get(`/functions/${name}`);
      return response.data;
    });
  }

  /**
   * Update a function
   */
  async updateFunction(name: string, data: UpdateFunctionRequest): Promise<ImpulsFunction> {
    return this.withRetry(async () => {
      const response = await this.client.put(`/functions/${name}`, data);
      return response.data;
    });
  }

  /**
   * Delete a function
   */
  async deleteFunction(name: string): Promise<{ message: string; name: string }> {
    return this.withRetry(async () => {
      const response = await this.client.delete(`/functions/${name}`);
      return response.data;
    });
  }

  /**
   * Invoke a function
   */
  async invokeFunction(
    name: string,
    request: InvokeFunctionRequest = {}
  ): Promise<InvokeFunctionResponse> {
    const params = request.local ? { local: 'true' } : {};
    const response = await this.client.post(
      `/functions/${name}/invoke`,
      request.payload || {},
      { params }
    );
    return response.data;
  }
}

export default ImpulsClient;
