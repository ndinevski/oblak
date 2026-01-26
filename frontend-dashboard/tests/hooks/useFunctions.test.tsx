/**
 * useFunctions hooks tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { 
  useFunctions, 
  useFunction, 
  useFunctionByName,
  useFunctionCount,
  useCreateFunction,
  useUpdateFunction,
  useDeleteFunction,
  useInvokeFunction,
  functionKeys,
} from '@/hooks/useFunctions';
import { functionsApi } from '@/lib/api/functions';
import { ReactNode } from 'react';

// Mock the functions API
vi.mock('@/lib/api/functions', () => ({
  functionsApi: {
    list: vi.fn(),
    getById: vi.fn(),
    getByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    invoke: vi.fn(),
    count: vi.fn(),
  },
}));

const mockFunction = {
  id: 1,
  documentId: 'doc-123',
  name: 'test-function',
  runtime: 'nodejs20',
  handler: 'index.handler',
  memoryMB: 128,
  timeoutSec: 30,
  environment: {},
  tags: [],
  status: 'active',
  invocationCount: '0',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('useFunctions hooks', () => {
  let queryClient: QueryClient;

  function createWrapper() {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    };
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  describe('functionKeys', () => {
    it('should generate correct query keys', () => {
      expect(functionKeys.all).toEqual(['functions']);
      expect(functionKeys.lists()).toEqual(['functions', 'list']);
      expect(functionKeys.list({ page: 1 })).toEqual(['functions', 'list', { page: 1 }]);
      expect(functionKeys.details()).toEqual(['functions', 'detail']);
      expect(functionKeys.detail(1)).toEqual(['functions', 'detail', 1]);
      expect(functionKeys.byName('test')).toEqual(['functions', 'name', 'test']);
      expect(functionKeys.count()).toEqual(['functions', 'count']);
    });
  });

  describe('useFunctions', () => {
    it('should fetch functions list', async () => {
      const mockData = {
        data: [mockFunction],
        meta: { pagination: { page: 1, pageSize: 10, pageCount: 1, total: 1 } },
      };
      vi.mocked(functionsApi.list).mockResolvedValue(mockData);

      const { result } = renderHook(() => useFunctions(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(functionsApi.list).toHaveBeenCalledWith(undefined);
      expect(result.current.data).toEqual(mockData);
    });

    it('should pass filter params', async () => {
      vi.mocked(functionsApi.list).mockResolvedValue({ data: [], meta: { pagination: {} } } as any);
      const params = { page: 2, runtime: 'nodejs20' as const };

      const { result } = renderHook(() => useFunctions(params), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(functionsApi.list).toHaveBeenCalledWith(params);
    });
  });

  describe('useFunction', () => {
    it('should fetch function by id', async () => {
      vi.mocked(functionsApi.getById).mockResolvedValue({ data: mockFunction });

      const { result } = renderHook(() => useFunction(1), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(functionsApi.getById).toHaveBeenCalledWith(1);
      expect(result.current.data).toEqual(mockFunction);
    });

    it('should not fetch when id is undefined', () => {
      renderHook(() => useFunction(undefined), { wrapper: createWrapper() });

      expect(functionsApi.getById).not.toHaveBeenCalled();
    });
  });

  describe('useFunctionByName', () => {
    it('should fetch function by name', async () => {
      vi.mocked(functionsApi.getByName).mockResolvedValue({ data: mockFunction });

      const { result } = renderHook(() => useFunctionByName('test-function'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(functionsApi.getByName).toHaveBeenCalledWith('test-function');
      expect(result.current.data).toEqual(mockFunction);
    });

    it('should not fetch when name is undefined', () => {
      renderHook(() => useFunctionByName(undefined), { wrapper: createWrapper() });

      expect(functionsApi.getByName).not.toHaveBeenCalled();
    });
  });

  describe('useFunctionCount', () => {
    it('should fetch function count', async () => {
      vi.mocked(functionsApi.count).mockResolvedValue(5);

      const { result } = renderHook(() => useFunctionCount(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(functionsApi.count).toHaveBeenCalled();
      expect(result.current.data).toBe(5);
    });
  });

  describe('useCreateFunction', () => {
    it('should create a function', async () => {
      const createData = {
        name: 'new-function',
        runtime: 'nodejs20' as const,
        handler: 'index.handler',
        code: 'exports.handler = async () => {}',
      };
      vi.mocked(functionsApi.create).mockResolvedValue({ data: mockFunction });

      const { result } = renderHook(() => useCreateFunction(), { wrapper: createWrapper() });

      await result.current.mutateAsync(createData);

      expect(functionsApi.create).toHaveBeenCalledWith(createData);
    });
  });

  describe('useUpdateFunction', () => {
    it('should update a function', async () => {
      const updateData = { description: 'Updated' };
      vi.mocked(functionsApi.update).mockResolvedValue({ data: mockFunction });

      const { result } = renderHook(() => useUpdateFunction(), { wrapper: createWrapper() });

      await result.current.mutateAsync({ id: 1, data: updateData });

      expect(functionsApi.update).toHaveBeenCalledWith(1, updateData);
    });
  });

  describe('useDeleteFunction', () => {
    it('should delete a function', async () => {
      vi.mocked(functionsApi.delete).mockResolvedValue();

      const { result } = renderHook(() => useDeleteFunction(), { wrapper: createWrapper() });

      await result.current.mutateAsync(1);

      expect(functionsApi.delete).toHaveBeenCalledWith(1);
    });
  });

  describe('useInvokeFunction', () => {
    it('should invoke a function', async () => {
      const invokeResult = {
        result: { message: 'success' },
        execution_time_ms: 100,
        logs: [],
      };
      vi.mocked(functionsApi.invoke).mockResolvedValue(invokeResult);

      const { result } = renderHook(() => useInvokeFunction(), { wrapper: createWrapper() });

      const response = await result.current.mutateAsync({ 
        id: 1, 
        request: { payload: { key: 'value' } } 
      });

      expect(functionsApi.invoke).toHaveBeenCalledWith(1, { payload: { key: 'value' } });
      expect(response).toEqual(invokeResult);
    });
  });
});
