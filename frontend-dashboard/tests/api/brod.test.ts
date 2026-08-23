/**
 * Tests for the Brod API client and its presentation helpers.
 *
 * The behaviour that matters: a namespaced repository name keeps its slashes
 * as real path separators while each component is still escaped, and status
 * rendering never depends on colour alone.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  API_CONFIG: {
    baseURL: 'http://localhost:1337/api',
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  },
}));

import {
  brodApi,
  containerStatusClass,
  containerStatusLabel,
  formatBytes,
  formatPorts,
  isRunning,
  shortDigest,
  type ContainerStatus,
} from '@/lib/api/brod';

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);
const mockDelete = vi.mocked(apiClient.delete);

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockDelete.mockReset();
  mockGet.mockResolvedValue({ data: { data: [] } } as never);
  mockPost.mockResolvedValue({ data: { data: {} } } as never);
  mockDelete.mockResolvedValue({ data: {} } as never);
});

describe('brodApi request paths', () => {
  it('unwraps the Strapi data envelope', async () => {
    mockGet.mockResolvedValue({ data: { data: [{ name: 'my-app' }] } } as never);

    const repos = await brodApi.listRepositories();
    expect(repos).toEqual([{ name: 'my-app' }]);
  });

  it('escapes a simple repository name', async () => {
    await brodApi.getRepository('my-app');
    expect(mockGet.mock.calls[0][0]).toBe('/brod/repositories/my-app');
  });

  it('keeps slashes in a namespaced repository name as path separators', async () => {
    // encodeURIComponent on the whole name would turn the slash into %2F and
    // break the route, so only the components are escaped.
    await brodApi.getRepository('team/my-app');
    expect(mockGet.mock.calls[0][0]).toBe('/brod/repositories/team/my-app');
  });

  it('escapes characters within a repository component', async () => {
    await brodApi.getRepository('team/my app');
    expect(mockGet.mock.calls[0][0]).toBe('/brod/repositories/team/my%20app');
  });

  it('escapes the tag when deleting an image', async () => {
    await brodApi.deleteImage('team/my-app', 'v1.0+build');
    expect(mockDelete.mock.calls[0][0]).toBe(
      '/brod/repositories/team/my-app/images/v1.0%2Bbuild'
    );
  });

  it('lists containers including stopped ones by default', async () => {
    await brodApi.listContainers();
    expect(mockGet.mock.calls[0][0]).toBe('/brod/containers?all=true');
  });

  it('forces removal when deleting a container', async () => {
    // The dashboard already confirms with the user, so the API call does not
    // need to fail on a running container.
    await brodApi.deleteContainer('web');
    expect(mockDelete.mock.calls[0][0]).toBe('/brod/containers/web?force=true');
  });

  it('passes the tail through to the logs endpoint', async () => {
    await brodApi.containerLogs('web', 50);
    expect(mockGet.mock.calls[0][0]).toBe('/brod/containers/web/logs?tail=50');
  });
});

describe('container status presentation', () => {
  it('gives every status a non-empty label', () => {
    const statuses: ContainerStatus[] = [
      'pending',
      'running',
      'paused',
      'restarting',
      'stopped',
      'exited',
      'failed',
      'unknown',
    ];
    for (const s of statuses) {
      expect(containerStatusLabel(s)).toBeTruthy();
      // The class always accompanies a visible label, so state is never
      // carried by colour alone.
      expect(containerStatusClass(s)).toBeTruthy();
    }
  });

  it('capitalises the label', () => {
    expect(containerStatusLabel('running')).toBe('Running');
    expect(containerStatusLabel('exited')).toBe('Exited');
  });

  it('treats running and restarting as running', () => {
    expect(isRunning('running')).toBe(true);
    // Restarting is transiently down but the workload is live, so the UI
    // offers stop rather than start.
    expect(isRunning('restarting')).toBe(true);
    expect(isRunning('exited')).toBe(false);
    expect(isRunning('failed')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('scales through the unit ladder', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('handles zero and missing values', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(undefined)).toBe('0 B');
  });
});

describe('shortDigest', () => {
  it('strips the algorithm prefix and truncates', () => {
    expect(shortDigest('sha256:abcdef0123456789abcdef')).toBe('abcdef012345');
  });

  it('handles a digest with no prefix', () => {
    expect(shortDigest('abcdef0123456789')).toBe('abcdef012345');
  });
});

describe('formatPorts', () => {
  it('renders a host-to-container mapping', () => {
    expect(formatPorts([{ container_port: 80, host_port: 8080, protocol: 'tcp' }])).toBe(
      '8080->80/tcp'
    );
  });

  it('defaults the protocol to tcp', () => {
    expect(formatPorts([{ container_port: 80, host_port: 8080 }])).toBe('8080->80/tcp');
  });

  it('joins several mappings', () => {
    const text = formatPorts([
      { container_port: 80, host_port: 8080 },
      { container_port: 443, host_port: 8443 },
    ]);
    expect(text).toBe('8080->80/tcp, 8443->443/tcp');
  });

  it('renders a dash when there are no ports', () => {
    expect(formatPorts(undefined)).toBe('-');
    expect(formatPorts([])).toBe('-');
  });
});
