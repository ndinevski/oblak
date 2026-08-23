/**
 * Brod API client.
 *
 * Container images and running containers, proxied through Strapi.
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContainerStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'restarting'
  | 'stopped'
  | 'exited'
  | 'failed'
  | 'unknown';

export type RestartPolicy = 'no' | 'on-failure' | 'always' | 'unless-stopped';

export interface PortMapping {
  container_port: number;
  host_port: number;
  protocol?: string;
}

export interface VolumeMount {
  source: string;
  target: string;
  read_only?: boolean;
}

export interface BrodContainer {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  status_detail?: string;
  command?: string[];
  env?: Record<string, string>;
  labels?: Record<string, string>;
  ports?: PortMapping[];
  volumes?: VolumeMount[];
  cpu_limit?: number;
  memory_limit?: number;
  restart_policy?: RestartPolicy;
  exit_code?: number;
  started_at?: string;
  created_at: string;
  finished_at?: string;
  ip_address?: string;
  network?: string;
}

export interface BrodRepository {
  name: string;
  description?: string;
  uri: string;
  image_count: number;
  size_bytes: number;
  latest_tag?: string;
  updated_at?: string;
  exists: boolean;
}

export interface BrodImage {
  repository: string;
  tag: string;
  digest: string;
  size_bytes: number;
  pushed_at?: string;
  architecture?: string;
  os?: string;
  /** Other tags on the same digest; deleting this image removes them too. */
  shared_tags?: string[];
}

export interface BrodContainerStats {
  container_id: string;
  sampled_at: string;
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  block_read_bytes: number;
  block_write_bytes: number;
}

export interface BrodLogEntry {
  timestamp: string;
  stream: string;
  message: string;
}

export interface BrodHealth {
  service: string;
  status: string;
  engine: string;
  engine_version?: string;
  registry: string;
  registry_host?: string;
  engine_error?: string;
  registry_error?: string;
}

export interface BrodRegistryInfo {
  host: string;
  push_example: string;
  pull_example: string;
  reachable: boolean;
}

export interface CreateContainerInput {
  name: string;
  image: string;
  command?: string[];
  env?: Record<string, string>;
  ports?: PortMapping[];
  volumes?: VolumeMount[];
  cpu_limit?: number;
  memory_limit?: number;
  restart_policy?: RestartPolicy;
  start?: boolean;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Unwraps Strapi's `{ data: ... }` envelope. */
async function get<T>(path: string): Promise<T> {
  const response = await apiClient.get<{ data: T }>(`/brod${path}`);
  return response.data.data;
}

/**
 * Encodes a repository name for a URL path.
 *
 * A name may contain slashes ("team/app") and those are real path separators,
 * so only the individual components are escaped.
 */
function encodeRepo(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/');
}

export const brodApi = {
  health: () => get<BrodHealth>('/health'),
  registry: () => get<BrodRegistryInfo>('/registry'),

  // --- Repositories ---------------------------------------------------------

  listRepositories: () => get<BrodRepository[]>('/repositories'),

  getRepository: (name: string) => get<BrodRepository>(`/repositories/${encodeRepo(name)}`),

  createRepository: async (name: string, description?: string): Promise<BrodRepository> => {
    const response = await apiClient.post<{ data: { repository: BrodRepository } }>(
      '/brod/repositories',
      { name, description }
    );
    return response.data.data.repository;
  },

  deleteRepository: async (name: string): Promise<void> => {
    await apiClient.delete(`/brod/repositories/${encodeRepo(name)}`);
  },

  listImages: (repository: string) =>
    get<BrodImage[]>(`/repositories/${encodeRepo(repository)}/images`),

  deleteImage: async (repository: string, tag: string): Promise<void> => {
    await apiClient.delete(
      `/brod/repositories/${encodeRepo(repository)}/images/${encodeURIComponent(tag)}`
    );
  },

  // --- Containers -----------------------------------------------------------

  listContainers: (all = true) => get<BrodContainer[]>(`/containers?all=${all}`),

  getContainer: (id: string) => get<BrodContainer>(`/containers/${encodeURIComponent(id)}`),

  createContainer: async (input: CreateContainerInput): Promise<BrodContainer> => {
    const response = await apiClient.post<{ data: BrodContainer }>('/brod/containers', input);
    return response.data.data;
  },

  deleteContainer: async (id: string): Promise<void> => {
    await apiClient.delete(`/brod/containers/${encodeURIComponent(id)}?force=true`);
  },

  startContainer: async (id: string): Promise<BrodContainer> => {
    const response = await apiClient.post<{ data: BrodContainer }>(
      `/brod/containers/${encodeURIComponent(id)}/start`,
      {}
    );
    return response.data.data;
  },

  stopContainer: async (id: string): Promise<BrodContainer> => {
    const response = await apiClient.post<{ data: BrodContainer }>(
      `/brod/containers/${encodeURIComponent(id)}/stop`,
      {}
    );
    return response.data.data;
  },

  restartContainer: async (id: string): Promise<BrodContainer> => {
    const response = await apiClient.post<{ data: BrodContainer }>(
      `/brod/containers/${encodeURIComponent(id)}/restart`,
      {}
    );
    return response.data.data;
  },

  containerLogs: (id: string, tail = 200) =>
    get<BrodLogEntry[]>(`/containers/${encodeURIComponent(id)}/logs?tail=${tail}`),

  containerStats: (id: string) =>
    get<BrodContainerStats>(`/containers/${encodeURIComponent(id)}/stats`),
};

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * Status styling.
 *
 * Every status is rendered with its label alongside the colour, so state is
 * never carried by colour alone.
 */
export function containerStatusClass(status: ContainerStatus): string {
  switch (status) {
    case 'running':
      return 'bg-green-500/10 text-green-700 dark:text-green-500 border-green-500/20';
    case 'restarting':
    case 'pending':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
    case 'failed':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    case 'exited':
    case 'stopped':
    case 'paused':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function containerStatusLabel(status: ContainerStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function isRunning(status: ContainerStatus): boolean {
  return status === 'running' || status === 'restarting';
}

/** Formats a byte count for display. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

/** Shortens a sha256 digest to something readable. */
export function shortDigest(digest: string): string {
  const hex = digest.replace(/^sha256:/, '');
  return hex.slice(0, 12);
}

/** Renders a container's published ports as "8080->80/tcp". */
export function formatPorts(ports: PortMapping[] | undefined): string {
  if (!ports?.length) return '-';
  return ports
    .map((p) => `${p.host_port || '?'}->${p.container_port}/${p.protocol || 'tcp'}`)
    .join(', ');
}
