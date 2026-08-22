/**
 * Functions API tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { functionsApi } from '@/lib/api/functions';
import { apiClient } from '@/lib/api/client';

// Mock the apiClient
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  // functionsApi reads API_CONFIG.baseURL at module load, so the mock has to
  // provide it or importing the module under test throws.
  API_CONFIG: {
    baseURL: 'http://localhost:1337/api',
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  },
}));

const mockFunction = {
  id: 1,
  documentId: 'doc-123',
  name: 'test-function',
  description: 'A test function',
  runtime: 'nodejs20' as const,
  handler: 'index.handler',
  code: 'exports.handler = async () => {}',
  memoryMB: 128,
  timeoutSec: 30,
  environment: { API_KEY: 'secret' },
  tags: ['test'],
  status: 'active' as const,
  invocationCount: '100',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

describe('functionsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('list', () => {
    it('should fetch functions list', async () => {
      const mockResponse = {
        data: [mockFunction],
        meta: { pagination: { page: 1, pageSize: 10, pageCount: 1, total: 1 } },
      };
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse });

      const result = await functionsApi.list();

      expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('/functions'));
      expect(result).toEqual(mockResponse);
    });

    it('should include pagination params', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [], meta: {} } });

      await functionsApi.list({ page: 2, pageSize: 20 });

      // api::function.function's find controller reads flat page/pageSize
      // query params, not Strapi's default pagination[page] convention.
      const calledUrl = vi.mocked(apiClient.get).mock.calls[0][0];
      expect(calledUrl).toContain('page=2');
      expect(calledUrl).toContain('pageSize=20');
    });

    it('should include filter params', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [], meta: {} } });

      await functionsApi.list({ runtime: 'nodejs20', status: 'active', search: 'test' });

      const calledUrl = vi.mocked(apiClient.get).mock.calls[0][0];
      expect(calledUrl).toContain('runtime=nodejs20');
      expect(calledUrl).toContain('status=active');
      expect(calledUrl).toContain('search=test');
    });
  });

  describe('getById', () => {
    it('should fetch function by id', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockFunction } });

      const result = await functionsApi.getById(1);

      expect(apiClient.get).toHaveBeenCalledWith('/functions/1');
      expect(result.data).toEqual(mockFunction);
    });

    it('should accept string id', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockFunction } });

      await functionsApi.getById('doc-123');

      expect(apiClient.get).toHaveBeenCalledWith('/functions/doc-123');
    });
  });

  describe('getByName', () => {
    it('should fetch function by name', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockFunction } });

      const result = await functionsApi.getByName('test-function');

      expect(apiClient.get).toHaveBeenCalledWith('/functions/name/test-function');
      expect(result.data).toEqual(mockFunction);
    });
  });

  describe('create', () => {
    it('should create a new function', async () => {
      const createData = {
        name: 'new-function',
        runtime: 'nodejs20' as const,
        handler: 'index.handler',
        code: 'exports.handler = async () => {}',
      };
      vi.mocked(apiClient.post).mockResolvedValue({ data: { data: mockFunction } });

      const result = await functionsApi.create(createData);

      expect(apiClient.post).toHaveBeenCalledWith('/functions', { data: createData });
      expect(result.data).toEqual(mockFunction);
    });

    it('should include optional fields', async () => {
      const createData = {
        name: 'new-function',
        runtime: 'python312' as const,
        handler: 'main.handler',
        code: 'def handler(): pass',
        description: 'A Python function',
        memoryMB: 256,
        timeoutSec: 60,
        environment: { DEBUG: 'true' },
        tags: ['python', 'api'],
      };
      vi.mocked(apiClient.post).mockResolvedValue({ data: { data: mockFunction } });

      await functionsApi.create(createData);

      expect(apiClient.post).toHaveBeenCalledWith('/functions', { data: createData });
    });
  });

  describe('update', () => {
    it('should update a function', async () => {
      const updateData = {
        description: 'Updated description',
        memoryMB: 256,
      };
      vi.mocked(apiClient.put).mockResolvedValue({ data: { data: mockFunction } });

      const result = await functionsApi.update(1, updateData);

      expect(apiClient.put).toHaveBeenCalledWith('/functions/1', { data: updateData });
      expect(result.data).toEqual(mockFunction);
    });
  });

  describe('delete', () => {
    it('should delete a function', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue({});

      await functionsApi.delete(1);

      expect(apiClient.delete).toHaveBeenCalledWith('/functions/1');
    });
  });

  describe('invoke', () => {
    it('should invoke function with payload', async () => {
      const mockResult = {
        result: { message: 'success' },
        execution_time_ms: 150,
        logs: ['Log line'],
      };
      // The invoke controller responds with { data: <function body> }, which
      // functionsApi.invoke unwraps.
      vi.mocked(apiClient.post).mockResolvedValue({ data: { data: mockResult } });

      const result = await functionsApi.invoke(1, { payload: { key: 'value' } });

      expect(apiClient.post).toHaveBeenCalledWith('/functions/1/invoke', { key: 'value' });
      expect(result).toEqual(mockResult);
    });

    it('should invoke function without payload', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: { result: null, execution_time_ms: 50 } });

      await functionsApi.invoke(1);

      expect(apiClient.post).toHaveBeenCalledWith('/functions/1/invoke', {});
    });
  });

  describe('count', () => {
    it('should return function count', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { count: 5 } });

      const result = await functionsApi.count();

      expect(apiClient.get).toHaveBeenCalledWith('/functions/count');
      expect(result).toBe(5);
    });
  });
});
