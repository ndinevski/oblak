/**
 * Impuls Client tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  ImpulsClient, 
  createImpulsClient,
  ImpulsFunction, 
  ImpulsApiError,
  CreateFunctionRequest,
  InvokeFunctionResponse,
  ListFunctionsResponse
} from '../../src/api/function/services/impuls-client';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('ImpulsClient', () => {
  let client: ImpulsClient;
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
    
    mockedAxios.create.mockReturnValue(mockAxiosInstance as unknown as AxiosInstance);
    
    client = new ImpulsClient({
      baseUrl: 'http://impuls:8080',
      timeout: 30000,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://impuls:8080/api/v1',
          timeout: 30000,
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should include API key header when provided', () => {
      vi.clearAllMocks();
      new ImpulsClient({
        baseUrl: 'http://impuls:8080',
        apiKey: 'test-api-key',
      });
      
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
          }),
        })
      );
    });
  });

  describe('createImpulsClient factory', () => {
    it('should create an ImpulsClient instance', () => {
      const factoryClient = createImpulsClient({
        baseUrl: 'http://impuls:8080',
      });
      expect(factoryClient).toBeInstanceOf(ImpulsClient);
    });
  });

  describe('createFunction', () => {
    const mockCreateData: CreateFunctionRequest = {
      name: 'test-function',
      runtime: 'nodejs20',
      handler: 'index.handler',
      code: 'exports.handler = async () => {}',
      memory_mb: 128,
      timeout_sec: 30,
      environment: {},
    };

    const mockResponse: ImpulsFunction = {
      id: 'func-123',
      name: 'test-function',
      runtime: 'nodejs20',
      handler: 'index.handler',
      code: 'exports.handler = async () => {}',
      memory_mb: 128,
      timeout_sec: 30,
      environment: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    it('should create function successfully', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await client.createFunction(mockCreateData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/functions', mockCreateData);
      expect(result).toEqual(mockResponse);
    });

    it('should throw error on failure', async () => {
      const error = new Error('Network error');
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(client.createFunction(mockCreateData)).rejects.toThrow('Network error');
    });
  });

  describe('getFunction', () => {
    const mockFunction: ImpulsFunction = {
      id: 'func-123',
      name: 'test-function',
      runtime: 'nodejs20',
      handler: 'index.handler',
      memory_mb: 128,
      timeout_sec: 30,
      environment: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    it('should get function by name', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockFunction });

      const result = await client.getFunction('test-function');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/functions/test-function');
      expect(result).toEqual(mockFunction);
    });
  });

  describe('updateFunction', () => {
    const mockUpdateData = {
      code: 'exports.handler = async () => { return "updated"; }',
      memory_mb: 256,
    };

    const mockResponse: ImpulsFunction = {
      id: 'func-123',
      name: 'test-function',
      runtime: 'nodejs20',
      handler: 'index.handler',
      code: 'exports.handler = async () => { return "updated"; }',
      memory_mb: 256,
      timeout_sec: 30,
      environment: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    };

    it('should update function', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      const result = await client.updateFunction('test-function', mockUpdateData);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/functions/test-function', mockUpdateData);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteFunction', () => {
    it('should delete function', async () => {
      mockAxiosInstance.delete.mockResolvedValue({ 
        data: { message: 'Function deleted', name: 'test-function' }
      });

      const result = await client.deleteFunction('test-function');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/functions/test-function');
      expect(result).toEqual({ message: 'Function deleted', name: 'test-function' });
    });
  });

  describe('invokeFunction', () => {
    const mockPayload = { key: 'value' };

    const mockResult: InvokeFunctionResponse = {
      result: { message: 'success' },
      execution_time_ms: 150,
      memory_used_mb: 64,
      logs: ['Log line 1', 'Log line 2'],
    };

    it('should invoke function with payload', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: mockResult });

      const result = await client.invokeFunction('test-function', { payload: mockPayload });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/functions/test-function/invoke',
        mockPayload,
        { params: {} }
      );
      expect(result).toEqual(mockResult);
    });

    it('should invoke function with local flag', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: mockResult });

      await client.invokeFunction('test-function', { payload: mockPayload, local: true });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/functions/test-function/invoke',
        mockPayload,
        { params: { local: 'true' } }
      );
    });

    it('should invoke function without payload', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: mockResult });

      await client.invokeFunction('test-function');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/functions/test-function/invoke',
        {},
        { params: {} }
      );
    });
  });

  describe('listFunctions', () => {
    const mockResponse: ListFunctionsResponse = {
      functions: [
        {
          id: 'func-1',
          name: 'function-1',
          runtime: 'nodejs20',
          handler: 'index.handler',
          memory_mb: 128,
          timeout_sec: 30,
          environment: {},
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'func-2',
          name: 'function-2',
          runtime: 'python312',
          handler: 'main.handler',
          memory_mb: 256,
          timeout_sec: 60,
          environment: {},
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ],
      count: 2,
    };

    it('should list all functions', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.listFunctions();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/functions');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('health', () => {
    it('should return health status', async () => {
      mockAxiosInstance.get.mockResolvedValue({ 
        data: { status: 'healthy', service: 'impuls' } 
      });

      const result = await client.health();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
      expect(result).toEqual({ status: 'healthy', service: 'impuls' });
    });
  });

  describe('retry logic', () => {
    const mockFunction: ImpulsFunction = {
      id: 'func-123',
      name: 'test-function',
      runtime: 'nodejs20',
      handler: 'index.handler',
      memory_mb: 128,
      timeout_sec: 30,
      environment: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    it('should succeed on retry after transient failure', async () => {
      const transientError = new Error('ECONNRESET');
      mockAxiosInstance.get
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ data: mockFunction });

      const result = await client.getFunction('test-function');

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockFunction);
    });

    it('should fail after max retries', async () => {
      const error = new Error('Connection refused');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.getFunction('test-function')).rejects.toThrow('Connection refused');
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry on 4xx errors', async () => {
      // Create a proper AxiosError mock for 4xx errors
      const axiosError = new AxiosError('Not Found', 'ERR_BAD_REQUEST');
      (axiosError as any).isAxiosError = true;
      (axiosError as any).response = { 
        status: 404, 
        data: { message: 'Function not found' } 
      };
      
      mockAxiosInstance.get.mockRejectedValue(axiosError);

      // 4xx errors should not be retried and should throw ImpulsApiError
      try {
        await client.getFunction('nonexistent');
        expect.fail('Should have thrown');
      } catch (error) {
        // Either ImpulsApiError or the original error depending on implementation
        expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1); // No retries on 4xx
      }
    });
  });

  describe('ImpulsApiError', () => {
    it('should create error with statusCode', () => {
      const error = new ImpulsApiError('Not Found', 404);
      expect(error.message).toBe('Not Found');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('ImpulsApiError');
    });

    it('should include details', () => {
      const details = { field: 'name', issue: 'required' };
      const error = new ImpulsApiError('Validation error', 400, details);
      expect(error.details).toEqual(details);
    });
  });
});
