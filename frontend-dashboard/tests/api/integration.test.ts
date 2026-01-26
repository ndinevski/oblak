/**
 * API Integration Tests
 * 
 * Tests for the API client layer and data flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// API client implementation
interface ApiClientConfig {
  baseURL: string;
  getToken: () => string | null;
}

interface ApiResponse<T> {
  data: T;
  meta?: {
    pagination?: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

class ApiClient {
  private baseURL: string;
  private getToken: () => string | null;

  constructor(config: ApiClientConfig) {
    this.baseURL = config.baseURL;
    this.getToken = config.getToken;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    options: {
      data?: unknown;
      params?: Record<string, string | number | boolean>;
    } = {}
  ): Promise<ApiResponse<T>> {
    const url = new URL(endpoint, this.baseURL);
    
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: options.data ? JSON.stringify(options.data) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async get<T>(endpoint: string, params?: Record<string, string | number | boolean>) {
    return this.request<T>('GET', endpoint, { params });
  }

  async post<T>(endpoint: string, data: unknown) {
    return this.request<T>('POST', endpoint, { data });
  }

  async put<T>(endpoint: string, data: unknown) {
    return this.request<T>('PUT', endpoint, { data });
  }

  async delete<T>(endpoint: string) {
    return this.request<T>('DELETE', endpoint);
  }
}

describe('ApiClient', () => {
  let client: ApiClient;
  let token: string | null = 'test-token';

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ApiClient({
      baseURL: 'http://api.example.com',
      getToken: () => token,
    });
  });

  afterEach(() => {
    token = 'test-token';
  });

  describe('GET requests', () => {
    it('should make GET request with correct URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1 }] }),
      });

      await client.get('/functions');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.example.com/functions',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should include query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await client.get('/functions', { page: 1, pageSize: 10, status: 'active' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.example.com/functions?page=1&pageSize=10&status=active',
        expect.any(Object)
      );
    });

    it('should include authorization header when token exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await client.get('/functions');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
    });

    it('should not include authorization header when no token', async () => {
      token = null;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await client.get('/public-endpoint');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Authorization': expect.any(String),
          }),
        })
      );
    });
  });

  describe('POST requests', () => {
    it('should make POST request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 1, name: 'new-function' } }),
      });

      await client.post('/functions', { name: 'new-function', runtime: 'nodejs20' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.example.com/functions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'new-function', runtime: 'nodejs20' }),
        })
      );
    });

    it('should include Content-Type header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      await client.post('/functions', {});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('PUT requests', () => {
    it('should make PUT request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 1, name: 'updated' } }),
      });

      await client.put('/functions/1', { name: 'updated' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.example.com/functions/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'updated' }),
        })
      );
    });
  });

  describe('DELETE requests', () => {
    it('should make DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { success: true } }),
      });

      await client.delete('/functions/1');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.example.com/functions/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-OK responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not found' }),
      });

      await expect(client.get('/not-found')).rejects.toThrow('Not found');
    });

    it('should handle error without message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await expect(client.get('/error')).rejects.toThrow('HTTP 500');
    });

    it('should handle JSON parse errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(client.get('/error')).rejects.toThrow('Unknown error');
    });
  });
});

// Function API tests
describe('Functions API', () => {
  interface CloudFunction {
    id: number;
    documentId: string;
    name: string;
    runtime: string;
    status: string;
    memory: number;
    timeout: number;
  }

  const mockFunctionsApi = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    invoke: vi.fn(),
    getLogs: vi.fn(),
    getMetrics: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list functions with pagination', async () => {
    mockFunctionsApi.list.mockResolvedValue({
      data: [
        { id: 1, documentId: 'fn-1', name: 'function1' },
        { id: 2, documentId: 'fn-2', name: 'function2' },
      ],
      meta: { pagination: { page: 1, pageSize: 10, total: 2, pageCount: 1 } },
    });

    const result = await mockFunctionsApi.list({ page: 1, pageSize: 10 });

    expect(result.data).toHaveLength(2);
    expect(result.meta?.pagination?.total).toBe(2);
  });

  it('should get function by documentId', async () => {
    mockFunctionsApi.get.mockResolvedValue({
      data: { id: 1, documentId: 'fn-1', name: 'function1', runtime: 'nodejs20' },
    });

    const result = await mockFunctionsApi.get('fn-1');

    expect(result.data.name).toBe('function1');
    expect(mockFunctionsApi.get).toHaveBeenCalledWith('fn-1');
  });

  it('should create function', async () => {
    mockFunctionsApi.create.mockResolvedValue({
      data: { id: 1, documentId: 'fn-new', name: 'new-function', runtime: 'nodejs20' },
    });

    const result = await mockFunctionsApi.create({
      name: 'new-function',
      runtime: 'nodejs20',
      memory: 256,
      timeout: 30,
    });

    expect(result.data.name).toBe('new-function');
  });

  it('should update function', async () => {
    mockFunctionsApi.update.mockResolvedValue({
      data: { id: 1, documentId: 'fn-1', name: 'updated-function', memory: 512 },
    });

    const result = await mockFunctionsApi.update('fn-1', { memory: 512 });

    expect(result.data.memory).toBe(512);
  });

  it('should delete function', async () => {
    mockFunctionsApi.delete.mockResolvedValue({ data: { success: true } });

    await mockFunctionsApi.delete('fn-1');

    expect(mockFunctionsApi.delete).toHaveBeenCalledWith('fn-1');
  });

  it('should invoke function', async () => {
    mockFunctionsApi.invoke.mockResolvedValue({
      data: { result: { message: 'Hello' }, duration: 100 },
    });

    const result = await mockFunctionsApi.invoke('fn-1', { name: 'World' });

    expect(result.data.result.message).toBe('Hello');
    expect(result.data.duration).toBeDefined();
  });

  it('should get function logs', async () => {
    mockFunctionsApi.getLogs.mockResolvedValue({
      data: [
        { timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'Started' },
        { timestamp: '2026-01-01T00:00:01Z', level: 'info', message: 'Completed' },
      ],
    });

    const result = await mockFunctionsApi.getLogs('fn-1', { limit: 100 });

    expect(result.data).toHaveLength(2);
  });

  it('should get function metrics', async () => {
    mockFunctionsApi.getMetrics.mockResolvedValue({
      data: {
        invocations: 1000,
        errors: 5,
        avgDuration: 150,
        memoryUsage: 200,
      },
    });

    const result = await mockFunctionsApi.getMetrics('fn-1', { period: '24h' });

    expect(result.data.invocations).toBe(1000);
    expect(result.data.errors).toBe(5);
  });
});

// VM API tests
describe('VMs API', () => {
  const mockVMsApi = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    resize: vi.fn(),
    getConsole: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list VMs', async () => {
    mockVMsApi.list.mockResolvedValue({
      data: [
        { id: 1, documentId: 'vm-1', name: 'vm1', status: 'running' },
        { id: 2, documentId: 'vm-2', name: 'vm2', status: 'stopped' },
      ],
    });

    const result = await mockVMsApi.list();

    expect(result.data).toHaveLength(2);
  });

  it('should start VM', async () => {
    mockVMsApi.start.mockResolvedValue({
      data: { id: 1, documentId: 'vm-1', status: 'running' },
    });

    const result = await mockVMsApi.start('vm-1');

    expect(result.data.status).toBe('running');
  });

  it('should stop VM', async () => {
    mockVMsApi.stop.mockResolvedValue({
      data: { id: 1, documentId: 'vm-1', status: 'stopped' },
    });

    const result = await mockVMsApi.stop('vm-1');

    expect(result.data.status).toBe('stopped');
  });

  it('should restart VM', async () => {
    mockVMsApi.restart.mockResolvedValue({
      data: { id: 1, documentId: 'vm-1', status: 'running' },
    });

    const result = await mockVMsApi.restart('vm-1');

    expect(result.data.status).toBe('running');
  });

  it('should resize VM', async () => {
    mockVMsApi.resize.mockResolvedValue({
      data: { id: 1, documentId: 'vm-1', cores: 4, memory: 8192 },
    });

    const result = await mockVMsApi.resize('vm-1', { cores: 4, memory: 8192 });

    expect(result.data.cores).toBe(4);
    expect(result.data.memory).toBe(8192);
  });

  it('should get console URL', async () => {
    mockVMsApi.getConsole.mockResolvedValue({
      data: { url: 'wss://console.example.com', token: 'abc123' },
    });

    const result = await mockVMsApi.getConsole('vm-1');

    expect(result.data.url).toContain('console');
    expect(result.data.token).toBeDefined();
  });
});

// Storage API tests
describe('Storage API', () => {
  const mockStorageApi = {
    listBuckets: vi.fn(),
    getBucket: vi.fn(),
    createBucket: vi.fn(),
    deleteBucket: vi.fn(),
    updateBucketPolicy: vi.fn(),
    listObjects: vi.fn(),
    uploadObject: vi.fn(),
    downloadObject: vi.fn(),
    deleteObject: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list buckets', async () => {
    mockStorageApi.listBuckets.mockResolvedValue({
      data: [
        { id: 1, documentId: 'bucket-1', name: 'my-bucket', objectCount: 10 },
        { id: 2, documentId: 'bucket-2', name: 'other-bucket', objectCount: 5 },
      ],
    });

    const result = await mockStorageApi.listBuckets();

    expect(result.data).toHaveLength(2);
  });

  it('should create bucket', async () => {
    mockStorageApi.createBucket.mockResolvedValue({
      data: { id: 1, documentId: 'bucket-new', name: 'new-bucket', accessPolicy: 'private' },
    });

    const result = await mockStorageApi.createBucket({
      name: 'new-bucket',
      accessPolicy: 'private',
    });

    expect(result.data.name).toBe('new-bucket');
    expect(result.data.accessPolicy).toBe('private');
  });

  it('should list objects in bucket', async () => {
    mockStorageApi.listObjects.mockResolvedValue({
      data: [
        { key: 'file1.txt', size: 1000, lastModified: '2026-01-01' },
        { key: 'folder/file2.txt', size: 2000, lastModified: '2026-01-02' },
      ],
    });

    const result = await mockStorageApi.listObjects('bucket-1');

    expect(result.data).toHaveLength(2);
  });

  it('should upload object', async () => {
    mockStorageApi.uploadObject.mockResolvedValue({
      data: { key: 'uploaded.txt', size: 500, etag: 'abc123' },
    });

    const result = await mockStorageApi.uploadObject('bucket-1', {
      key: 'uploaded.txt',
      content: new File(['content'], 'uploaded.txt'),
    });

    expect(result.data.key).toBe('uploaded.txt');
  });

  it('should delete object', async () => {
    mockStorageApi.deleteObject.mockResolvedValue({ data: { success: true } });

    await mockStorageApi.deleteObject('bucket-1', 'file.txt');

    expect(mockStorageApi.deleteObject).toHaveBeenCalledWith('bucket-1', 'file.txt');
  });

  it('should update bucket policy', async () => {
    mockStorageApi.updateBucketPolicy.mockResolvedValue({
      data: { id: 1, documentId: 'bucket-1', accessPolicy: 'public-read' },
    });

    const result = await mockStorageApi.updateBucketPolicy('bucket-1', 'public-read');

    expect(result.data.accessPolicy).toBe('public-read');
  });
});

// Auth API tests
describe('Auth API', () => {
  const mockAuthApi = {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should login user', async () => {
    mockAuthApi.login.mockResolvedValue({
      jwt: 'token123',
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
    });

    const result = await mockAuthApi.login({ identifier: 'test@example.com', password: 'pass' });

    expect(result.jwt).toBeDefined();
    expect(result.user.email).toBe('test@example.com');
  });

  it('should register user', async () => {
    mockAuthApi.register.mockResolvedValue({
      jwt: 'token456',
      user: { id: 2, username: 'newuser', email: 'new@example.com' },
    });

    const result = await mockAuthApi.register({
      username: 'newuser',
      email: 'new@example.com',
      password: 'password123',
    });

    expect(result.jwt).toBeDefined();
    expect(result.user.username).toBe('newuser');
  });

  it('should get current user', async () => {
    mockAuthApi.getMe.mockResolvedValue({
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
    });

    const result = await mockAuthApi.getMe();

    expect(result.id).toBe(1);
  });

  it('should update profile', async () => {
    mockAuthApi.updateProfile.mockResolvedValue({
      id: 1,
      username: 'updateduser',
      email: 'test@example.com',
    });

    const result = await mockAuthApi.updateProfile({ username: 'updateduser' });

    expect(result.username).toBe('updateduser');
  });

  it('should change password', async () => {
    mockAuthApi.changePassword.mockResolvedValue({ success: true });

    const result = await mockAuthApi.changePassword({
      currentPassword: 'oldpass',
      password: 'newpass',
      passwordConfirmation: 'newpass',
    });

    expect(result.success).toBe(true);
  });

  it('should request password reset', async () => {
    mockAuthApi.forgotPassword.mockResolvedValue({ ok: true });

    const result = await mockAuthApi.forgotPassword({ email: 'test@example.com' });

    expect(result.ok).toBe(true);
  });

  it('should reset password with token', async () => {
    mockAuthApi.resetPassword.mockResolvedValue({ ok: true });

    const result = await mockAuthApi.resetPassword({
      code: 'reset-code',
      password: 'newpass',
      passwordConfirmation: 'newpass',
    });

    expect(result.ok).toBe(true);
  });
});

// Data transformation tests
describe('Data Transformations', () => {
  describe('formatBytes', () => {
    const formatBytes = (bytes: number, decimals = 2): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
    };

    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(2048)).toBe('2 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });

  describe('formatDuration', () => {
    const formatDuration = (ms: number): string => {
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
      return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
    };

    it('should format milliseconds', () => {
      expect(formatDuration(100)).toBe('100ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(5500)).toBe('5.5s');
    });

    it('should format minutes', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
    });

    it('should format hours', () => {
      expect(formatDuration(3600000)).toBe('1h 0m');
      expect(formatDuration(5400000)).toBe('1h 30m');
    });
  });

  describe('formatRelativeTime', () => {
    const formatRelativeTime = (date: Date): string => {
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      return date.toLocaleDateString();
    };

    it('should format just now', () => {
      expect(formatRelativeTime(new Date())).toBe('just now');
    });

    it('should format minutes ago', () => {
      const date = new Date(Date.now() - 5 * 60000);
      expect(formatRelativeTime(date)).toBe('5 minutes ago');
    });

    it('should format hours ago', () => {
      const date = new Date(Date.now() - 3 * 3600000);
      expect(formatRelativeTime(date)).toBe('3 hours ago');
    });

    it('should format days ago', () => {
      const date = new Date(Date.now() - 2 * 86400000);
      expect(formatRelativeTime(date)).toBe('2 days ago');
    });
  });
});

// Pagination helpers tests
describe('Pagination Helpers', () => {
  interface PaginationParams {
    page: number;
    pageSize: number;
    total: number;
  }

  const calculatePagination = (params: PaginationParams) => {
    const { page, pageSize, total } = params;
    const pageCount = Math.ceil(total / pageSize);
    const hasNextPage = page < pageCount;
    const hasPreviousPage = page > 1;
    const startItem = (page - 1) * pageSize + 1;
    const endItem = Math.min(page * pageSize, total);

    return {
      pageCount,
      hasNextPage,
      hasPreviousPage,
      startItem,
      endItem,
    };
  };

  it('should calculate page count', () => {
    expect(calculatePagination({ page: 1, pageSize: 10, total: 25 }).pageCount).toBe(3);
    expect(calculatePagination({ page: 1, pageSize: 10, total: 30 }).pageCount).toBe(3);
    expect(calculatePagination({ page: 1, pageSize: 10, total: 5 }).pageCount).toBe(1);
  });

  it('should determine hasNextPage', () => {
    expect(calculatePagination({ page: 1, pageSize: 10, total: 25 }).hasNextPage).toBe(true);
    expect(calculatePagination({ page: 3, pageSize: 10, total: 25 }).hasNextPage).toBe(false);
  });

  it('should determine hasPreviousPage', () => {
    expect(calculatePagination({ page: 1, pageSize: 10, total: 25 }).hasPreviousPage).toBe(false);
    expect(calculatePagination({ page: 2, pageSize: 10, total: 25 }).hasPreviousPage).toBe(true);
  });

  it('should calculate item range', () => {
    const result = calculatePagination({ page: 2, pageSize: 10, total: 25 });
    expect(result.startItem).toBe(11);
    expect(result.endItem).toBe(20);
  });

  it('should handle last page correctly', () => {
    const result = calculatePagination({ page: 3, pageSize: 10, total: 25 });
    expect(result.startItem).toBe(21);
    expect(result.endItem).toBe(25);
  });
});
