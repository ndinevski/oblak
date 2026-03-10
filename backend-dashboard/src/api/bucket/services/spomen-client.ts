/**
 * Spomen Storage Client
 * HTTP client for communicating with the Spomen object storage service
 */

// =============================================================================
// Types matching Spomen Go models
// =============================================================================

export interface SpomenBucket {
  name: string;
  created_at: string;
  policy?: 'private' | 'public-read' | 'public-read-write';
  versioning: boolean;
  object_count?: number;
  total_size?: number;
  tags?: Record<string, string>;
}

export interface SpomenObject {
  key: string;
  size: number;
  content_type: string;
  etag: string;
  last_modified: string;
  metadata?: Record<string, string>;
  version_id?: string;
  is_delete_marker?: boolean;
}

export interface SpomenObjectList {
  objects: SpomenObject[];
  prefix?: string;
  delimiter?: string;
  is_truncated: boolean;
  next_marker?: string;
  common_prefixes?: string[];
}

export interface SpomenCreateBucketRequest {
  name: string;
  policy?: 'private' | 'public-read' | 'public-read-write';
  versioning?: boolean;
  tags?: Record<string, string>;
}

export interface SpomenUpdateBucketRequest {
  policy?: 'private' | 'public-read' | 'public-read-write';
  versioning?: boolean;
  tags?: Record<string, string>;
}

export interface SpomenCopyObjectRequest {
  source_bucket: string;
  source_key: string;
  dest_key: string;
  metadata?: Record<string, string>;
}

export interface SpomenPresignedURLRequest {
  key: string;
  expires_in?: number; // seconds, default 3600
  method?: 'GET' | 'PUT';
}

export interface SpomenPresignedURLResponse {
  url: string;
  key: string;
  method: string;
  expires_at: string;
}

// =============================================================================
// Error handling
// =============================================================================

export class SpomenClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'SpomenClientError';
  }
}

// =============================================================================
// Client implementation
// =============================================================================

interface SpomenClientConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
}

export function createSpomenClient(config: SpomenClientConfig) {
  const { baseUrl, timeout = 30000, retries = 3 } = config;

  async function request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      stream?: ReadableStream | Buffer;
      query?: Record<string, string | number | undefined>;
    } = {}
  ): Promise<T> {
    const { body, headers = {}, stream, query } = options;

    let url = `${baseUrl}${path}`;
    
    // Add query parameters
    if (query) {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const requestHeaders: Record<string, string> = {
      ...headers,
    };

    if (body && !stream) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: stream ? stream : body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = errorText;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorJson.message || errorText;
          } catch {
            // Use raw text
          }
          throw new SpomenClientError(errorMessage, response.status);
        }

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return await response.json() as T;
        }

        // For binary responses, return as-is
        return response as unknown as T;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof SpomenClientError) {
          // Don't retry client errors (4xx)
          if (error.statusCode >= 400 && error.statusCode < 500) {
            throw error;
          }
        }

        // Retry on network errors or 5xx
        if (attempt < retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          );
        }
      }
    }

    throw lastError || new Error('Request failed');
  }

  return {
    // =========================================================================
    // Bucket Operations
    // =========================================================================

    async listBuckets(): Promise<{ buckets: SpomenBucket[]; count: number }> {
      return request('GET', '/api/v1/buckets');
    },

    async getBucket(name: string): Promise<SpomenBucket> {
      return request('GET', `/api/v1/buckets/${encodeURIComponent(name)}`);
    },

    async createBucket(
      data: SpomenCreateBucketRequest
    ): Promise<SpomenBucket> {
      return request('POST', '/api/v1/buckets', { body: data });
    },

    async updateBucket(
      name: string,
      data: SpomenUpdateBucketRequest
    ): Promise<SpomenBucket> {
      return request('PUT', `/api/v1/buckets/${encodeURIComponent(name)}`, {
        body: data,
      });
    },

    async deleteBucket(
      name: string,
      force = false
    ): Promise<{ message: string; name: string }> {
      return request('DELETE', `/api/v1/buckets/${encodeURIComponent(name)}`, {
        query: force ? { force: 'true' } : undefined,
      });
    },

    // =========================================================================
    // Object Operations
    // =========================================================================

    async listObjects(
      bucket: string,
      options: {
        prefix?: string;
        delimiter?: string;
        marker?: string;
        maxKeys?: number;
      } = {}
    ): Promise<SpomenObjectList> {
      return request('GET', `/api/v1/buckets/${encodeURIComponent(bucket)}/objects`, {
        query: {
          prefix: options.prefix,
          delimiter: options.delimiter,
          marker: options.marker,
          max_keys: options.maxKeys,
        },
      });
    },

    async getObjectInfo(bucket: string, key: string): Promise<SpomenObject> {
      return request(
        'GET',
        `/api/v1/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`,
        {
          query: { info: 'true' },
        }
      );
    },

    async getObject(bucket: string, key: string): Promise<Response> {
      return request(
        'GET',
        `/api/v1/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`
      );
    },

    async putObject(
      bucket: string,
      key: string,
      data: Buffer | ReadableStream,
      options: {
        contentType?: string;
        contentLength?: number;
        metadata?: Record<string, string>;
      } = {}
    ): Promise<SpomenObject> {
      const headers: Record<string, string> = {};
      
      if (options.contentType) {
        headers['Content-Type'] = options.contentType;
      }
      if (options.contentLength) {
        headers['Content-Length'] = String(options.contentLength);
      }
      if (options.metadata) {
        Object.entries(options.metadata).forEach(([k, v]) => {
          headers[`X-Meta-${k}`] = v;
        });
      }

      return request(
        'PUT',
        `/api/v1/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`,
        {
          stream: data,
          headers,
        }
      );
    },

    async deleteObject(
      bucket: string,
      key: string
    ): Promise<{ message: string; key: string }> {
      return request(
        'DELETE',
        `/api/v1/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`
      );
    },

    async deleteObjects(
      bucket: string,
      keys: string[]
    ): Promise<{ deleted: string[]; errors: string[] }> {
      return request('POST', `/api/v1/buckets/${encodeURIComponent(bucket)}/delete`, {
        body: { keys },
      });
    },

    async copyObject(
      bucket: string,
      request_: SpomenCopyObjectRequest
    ): Promise<SpomenObject> {
      return request(
        'POST',
        `/api/v1/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(request_.source_key)}?action=copy`,
        {
          body: request_,
        }
      );
    },

    // =========================================================================
    // Presigned URLs
    // =========================================================================

    async getPresignedUrl(
      bucket: string,
      data: SpomenPresignedURLRequest
    ): Promise<SpomenPresignedURLResponse> {
      return request(
        'POST',
        `/api/v1/buckets/${encodeURIComponent(bucket)}/presign`,
        {
          body: data,
        }
      );
    },

    // =========================================================================
    // Health Check
    // =========================================================================

    async health(): Promise<{ status: string }> {
      return request('GET', '/health');
    },
  };
}

export type SpomenClient = ReturnType<typeof createSpomenClient>;
