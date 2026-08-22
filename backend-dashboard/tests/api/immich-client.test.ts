/**
 * Immich Client Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createImmichClient,
  ImmichClientError,
} from '../../src/api/polaroid/services/immich-client';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockFetchResponse(data: unknown, ok = true, status = 200) {
  return mockFetch.mockResolvedValueOnce({
    ok,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function mockFetchError(message: string) {
  return mockFetch.mockRejectedValueOnce(new Error(message));
}

describe('ImmichClient', () => {
  let client: ReturnType<typeof createImmichClient>;

  beforeEach(() => {
    client = createImmichClient({ baseUrl: 'http://immich:2283', apiKey: 'test-api-key' });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createImmichClient factory', () => {
    it('should return an object with expected methods', () => {
      expect(typeof client.ping).toBe('function');
      expect(typeof client.getServerInfo).toBe('function');
      expect(typeof client.getAssets).toBe('function');
      expect(typeof client.getAlbums).toBe('function');
      expect(typeof client.createAlbum).toBe('function');
      expect(typeof client.deleteAssets).toBe('function');
      expect(typeof client.searchSmart).toBe('function');
    });

    it('should return an object (not a class instance)', () => {
      expect(client).not.toBeNull();
      expect(typeof client).toBe('object');
    });

    it('should create separate clients with different configs', () => {
      const client2 = createImmichClient({ baseUrl: 'http://other:2283', apiKey: 'other-key' });
      expect(client).not.toBe(client2);
    });
  });

  describe('ping', () => {
    it('should call /api/server/ping and return pong', async () => {
      mockFetchResponse({ res: 'pong' });

      const result = await client.ping();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/server/ping');
      expect(result).toEqual({ res: 'pong' });
    });

    it('should include x-api-key header', async () => {
      mockFetchResponse({ res: 'pong' });

      await client.ping();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['x-api-key']).toBe('test-api-key');
    });
  });

  describe('getServerInfo', () => {
    it('should call /api/server/statistics', async () => {
      const mockInfo = {
        photos: 100,
        videos: 20,
        usage: 1073741824,
        usageByUser: [],
      };
      mockFetchResponse(mockInfo);

      const result = await client.getServerInfo();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/server/statistics');
      expect(result).toEqual(mockInfo);
    });
  });

  describe('getAssets', () => {
    it('should call /api/assets', async () => {
      mockFetchResponse([]);

      await client.getAssets({});

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/assets');
    });

    it('should append query params', async () => {
      mockFetchResponse([]);

      await client.getAssets({ skip: 0, take: 50, isFavorite: true });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('skip=0');
      expect(url).toContain('take=50');
      expect(url).toContain('isFavorite=true');
    });

    it('should not append undefined params', async () => {
      mockFetchResponse([]);

      await client.getAssets({ skip: 0, albumId: undefined });

      const [url] = mockFetch.mock.calls[0];
      expect(url).not.toContain('albumId');
    });
  });

  describe('getAlbums', () => {
    it('should call /api/albums', async () => {
      mockFetchResponse([]);

      await client.getAlbums();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/albums');
    });

    it('should pass shared param when provided', async () => {
      mockFetchResponse([]);

      await client.getAlbums(true);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('shared=true');
    });

    it('should not pass shared param when undefined', async () => {
      mockFetchResponse([]);

      await client.getAlbums();

      const [url] = mockFetch.mock.calls[0];
      expect(url).not.toContain('shared');
    });
  });

  describe('createAlbum', () => {
    it('should POST to /api/albums with body', async () => {
      const mockAlbum = {
        id: 'album-123',
        albumName: 'Vacation 2025',
        description: '',
        albumThumbnailAssetId: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        ownerId: 'user-1',
        shared: false,
        hasSharedLink: false,
        assetCount: 0,
        isActivityEnabled: true,
      };
      mockFetchResponse(mockAlbum);

      const result = await client.createAlbum({ albumName: 'Vacation 2025' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/albums');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual({ albumName: 'Vacation 2025' });
      expect(result).toEqual(mockAlbum);
    });

    it('should include assetIds in body when provided', async () => {
      mockFetchResponse({ id: 'album-456', albumName: 'With Assets', assetCount: 2 });

      await client.createAlbum({
        albumName: 'With Assets',
        assetIds: ['asset-1', 'asset-2'],
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.assetIds).toEqual(['asset-1', 'asset-2']);
    });
  });

  describe('deleteAssets', () => {
    it('should DELETE /api/assets with ids in body', async () => {
      mockFetchResponse(undefined, true, 204);

      await client.deleteAssets(['asset-1', 'asset-2']);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/assets');
      expect(options.method).toBe('DELETE');
      const body = JSON.parse(options.body);
      expect(body.ids).toEqual(['asset-1', 'asset-2']);
      expect(body.force).toBe(false);
    });

    it('should pass force flag when set to true', async () => {
      mockFetchResponse(undefined, true, 204);

      await client.deleteAssets(['asset-1'], true);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.force).toBe(true);
    });
  });

  describe('searchSmart', () => {
    it('should POST to /api/search/smart with query', async () => {
      const mockResponse = {
        assets: { items: [], nextPage: null, total: 0, count: 0 },
      };
      mockFetchResponse(mockResponse);

      const result = await client.searchSmart('sunset photos');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/search/smart');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.query).toBe('sunset photos');
      expect(result).toEqual(mockResponse);
    });

    it('should merge additional params into body', async () => {
      mockFetchResponse({ assets: { items: [], nextPage: null, total: 0, count: 0 } });

      await client.searchSmart('beach', { isFavorite: true, type: 'IMAGE' });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.query).toBe('beach');
      expect(body.isFavorite).toBe(true);
      expect(body.type).toBe('IMAGE');
    });
  });

  describe('retry logic', () => {
    it('should retry on network error and succeed on second attempt', async () => {
      vi.useFakeTimers();
      const successData = { res: 'pong' };

      mockFetchError('ECONNRESET');
      mockFetchResponse(successData);

      const pingPromise = client.ping();
      await vi.runAllTimersAsync();
      const result = await pingPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(successData);
      vi.useRealTimers();
    });

    it('should not retry on 4xx errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('Not Found'),
        json: () => Promise.resolve({ message: 'Not Found' }),
      });

      await expect(client.ping()).rejects.toThrow(ImmichClientError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 400 bad request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('Bad Request'),
        json: () => Promise.resolve({ message: 'Bad Request' }),
      });

      try {
        await client.ping();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ImmichClientError);
        expect((err as ImmichClientError).statusCode).toBe(400);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      }
    });

    it('should fail after max retries on network error', async () => {
      // Create a client with only 1 retry to avoid delay issues
      const fastClient = createImmichClient({
        baseUrl: 'http://localhost:2283',
        apiKey: 'test-key',
        retries: 1,
      });

      mockFetchError('Connection refused');

      await expect(fastClient.ping()).rejects.toThrow('Connection refused');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx server errors', async () => {
      const fastClient = createImmichClient({
        baseUrl: 'http://localhost:2283',
        apiKey: 'test-key',
        retries: 2,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('Internal Server Error'),
        json: () => Promise.resolve({ message: 'Internal Server Error' }),
      });
      mockFetchResponse({ res: 'pong' });

      const result = await fastClient.ping();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ res: 'pong' });
    });
  });

  describe('ImmichClientError', () => {
    it('should have correct name', () => {
      const error = new ImmichClientError('Not Found', 404);
      expect(error.name).toBe('ImmichClientError');
    });

    it('should have statusCode', () => {
      const error = new ImmichClientError('Not Found', 404);
      expect(error.statusCode).toBe(404);
    });

    it('should have message', () => {
      const error = new ImmichClientError('Unauthorized', 401);
      expect(error.message).toBe('Unauthorized');
    });

    it('should be instanceof Error', () => {
      const error = new ImmichClientError('Bad Request', 400);
      expect(error).toBeInstanceOf(Error);
    });

    it('should store originalError when provided', () => {
      const cause = new Error('TCP connection failed');
      const error = new ImmichClientError('Request failed', 0, cause);
      expect(error.originalError).toBe(cause);
    });

    it('should have undefined originalError when not provided', () => {
      const error = new ImmichClientError('Not Found', 404);
      expect(error.originalError).toBeUndefined();
    });
  });

  describe('HTTP method correctness', () => {
    it('should use GET for getAlbum', async () => {
      mockFetchResponse({ id: 'album-1', albumName: 'Test', assetCount: 0 });

      await client.getAlbum('album-1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/albums/album-1');
      expect(options.method).toBe('GET');
    });

    it('should use DELETE for deleteAlbum', async () => {
      mockFetchResponse(undefined, true, 200);

      await client.deleteAlbum('album-1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/albums/album-1');
      expect(options.method).toBe('DELETE');
    });

    it('should use PATCH for updateAlbum', async () => {
      mockFetchResponse({ id: 'album-1', albumName: 'Updated', assetCount: 0 });

      await client.updateAlbum('album-1', { albumName: 'Updated' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/albums/album-1');
      expect(options.method).toBe('PATCH');
    });

    it('should use PUT for addAssetsToAlbum', async () => {
      mockFetchResponse({ successfullyAdded: 2 });

      await client.addAssetsToAlbum('album-1', ['asset-1', 'asset-2']);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/albums/album-1/assets');
      expect(options.method).toBe('PUT');
    });
  });

  describe('shared links', () => {
    it('should GET /api/shared-links', async () => {
      mockFetchResponse([]);

      await client.getSharedLinks();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/shared-links');
    });

    it('should POST to create a shared link', async () => {
      const mockLink = {
        id: 'link-1',
        type: 'ALBUM',
        key: 'abc123',
        description: null,
        password: null,
        userId: 'user-1',
        assets: [],
        createdAt: '2025-01-01T00:00:00Z',
        expiresAt: null,
        allowUpload: false,
        allowDownload: true,
        showMetadata: true,
      };
      mockFetchResponse(mockLink);

      const result = await client.createSharedLink({ type: 'ALBUM', albumId: 'album-1' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/shared-links');
      expect(options.method).toBe('POST');
      expect(result).toEqual(mockLink);
    });
  });

  describe('people', () => {
    it('should GET /api/people', async () => {
      mockFetchResponse({ people: [], total: 0, visible: 0 });

      const result = await client.getPeople();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/people');
      expect(result.total).toBe(0);
    });

    it('should GET /api/people/:id', async () => {
      const mockPerson = {
        id: 'person-1',
        name: 'John Doe',
        birthDate: null,
        thumbnailPath: '/path/to/thumb',
        isHidden: false,
        updatedAt: '2025-01-01T00:00:00Z',
      };
      mockFetchResponse(mockPerson);

      const result = await client.getPerson('person-1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://immich:2283/api/people/person-1');
      expect(result).toEqual(mockPerson);
    });
  });
});
