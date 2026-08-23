/**
 * Brod Container Client
 * HTTP client for communicating with the Brod container service.
 */

// =============================================================================
// Types matching Brod Go models
// =============================================================================

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

export type BrodContainerStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'restarting'
  | 'stopped'
  | 'exited'
  | 'failed'
  | 'unknown';

export type BrodRestartPolicy = 'no' | 'on-failure' | 'always' | 'unless-stopped';

export interface BrodPortMapping {
  container_port: number;
  host_port: number;
  protocol?: string;
}

export interface BrodVolumeMount {
  source: string;
  target: string;
  read_only?: boolean;
}

export interface BrodContainer {
  id: string;
  name: string;
  image: string;
  status: BrodContainerStatus;
  status_detail?: string;
  command?: string[];
  env?: Record<string, string>;
  labels?: Record<string, string>;
  ports?: BrodPortMapping[];
  volumes?: BrodVolumeMount[];
  cpu_limit?: number;
  memory_limit?: number;
  restart_policy?: BrodRestartPolicy;
  exit_code?: number;
  started_at?: string;
  created_at: string;
  finished_at?: string;
  ip_address?: string;
  network?: string;
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

export interface BrodCreateContainerRequest {
  name: string;
  image: string;
  command?: string[];
  env?: Record<string, string>;
  labels?: Record<string, string>;
  ports?: BrodPortMapping[];
  volumes?: BrodVolumeMount[];
  cpu_limit?: number;
  memory_limit?: number;
  restart_policy?: BrodRestartPolicy;
  start?: boolean;
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

// =============================================================================
// Client
// =============================================================================

/** Raised when Brod answers with a non-2xx status. */
export class BrodError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'BrodError';
  }
}

export class BrodClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(baseUrl?: string, apiKey?: string, timeoutMs = 120_000) {
    this.baseUrl = (baseUrl || process.env.BROD_URL || 'http://localhost:8083').replace(/\/$/, '');
    this.apiKey = apiKey || process.env.BROD_API_KEY;
    // Generous by default: creating a container pulls an image first, which
    // legitimately takes minutes for a large one.
    this.timeoutMs = timeoutMs;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    timeoutMs = this.timeoutMs
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v1${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new BrodError(`Brod request timed out after ${timeoutMs}ms`, 504);
      }
      throw new BrodError(
        `Brod is unreachable: ${error instanceof Error ? error.message : String(error)}`,
        503
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();

    if (!response.ok) {
      // Brod reports failures as {"error": "..."}; fall back to the raw body
      // when it is something else entirely (a proxy error page, say).
      let message = text.slice(0, 500);
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error) message = parsed.error;
      } catch {
        // keep the raw text
      }
      throw new BrodError(message, response.status);
    }

    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  // --- Health ---------------------------------------------------------------

  /**
   * Health, over the root path rather than /api/v1.
   *
   * Never throws: the dashboard renders "unavailable" rather than erroring,
   * and a 503 from a degraded Brod still carries a useful body.
   */
  async health(): Promise<BrodHealth> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      return (await response.json()) as BrodHealth;
    } catch (error) {
      return {
        service: 'brod',
        status: 'unavailable',
        engine: 'unknown',
        registry: 'unknown',
        engine_error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  registryInfo(): Promise<BrodRegistryInfo> {
    return this.request<BrodRegistryInfo>('/registry', { method: 'GET' }, 15_000);
  }

  // --- Repositories ---------------------------------------------------------

  async listRepositories(): Promise<BrodRepository[]> {
    const body = await this.request<{ repositories: BrodRepository[] }>('/repositories', {
      method: 'GET',
    });
    return body.repositories ?? [];
  }

  createRepository(name: string, description?: string): Promise<{ repository: BrodRepository }> {
    return this.request('/repositories', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  getRepository(name: string): Promise<BrodRepository> {
    return this.request(`/repositories/${encodeRepositoryName(name)}`, { method: 'GET' });
  }

  deleteRepository(name: string): Promise<void> {
    return this.request(`/repositories/${encodeRepositoryName(name)}`, { method: 'DELETE' });
  }

  async listImages(repository: string): Promise<BrodImage[]> {
    const body = await this.request<{ images: BrodImage[] }>(
      `/repositories/${encodeRepositoryName(repository)}/images`,
      { method: 'GET' }
    );
    return body.images ?? [];
  }

  deleteImage(repository: string, tag: string): Promise<void> {
    return this.request(
      `/repositories/${encodeRepositoryName(repository)}/images/${encodeURIComponent(tag)}`,
      { method: 'DELETE' }
    );
  }

  // --- Containers -----------------------------------------------------------

  async listContainers(all = true): Promise<BrodContainer[]> {
    const body = await this.request<{ containers: BrodContainer[] }>(
      `/containers?all=${all}`,
      { method: 'GET' }
    );
    return body.containers ?? [];
  }

  getContainer(id: string): Promise<BrodContainer> {
    return this.request(`/containers/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  createContainer(req: BrodCreateContainerRequest): Promise<BrodContainer> {
    return this.request('/containers', { method: 'POST', body: JSON.stringify(req) });
  }

  deleteContainer(id: string, force = true): Promise<void> {
    return this.request(`/containers/${encodeURIComponent(id)}?force=${force}`, {
      method: 'DELETE',
    });
  }

  startContainer(id: string): Promise<BrodContainer> {
    return this.request(`/containers/${encodeURIComponent(id)}/start`, { method: 'POST' });
  }

  stopContainer(id: string, timeoutSeconds?: number): Promise<BrodContainer> {
    return this.request(`/containers/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
      body: JSON.stringify({ timeout_seconds: timeoutSeconds }),
    });
  }

  restartContainer(id: string, timeoutSeconds?: number): Promise<BrodContainer> {
    return this.request(`/containers/${encodeURIComponent(id)}/restart`, {
      method: 'POST',
      body: JSON.stringify({ timeout_seconds: timeoutSeconds }),
    });
  }

  async containerLogs(id: string, tail = 200): Promise<BrodLogEntry[]> {
    const body = await this.request<{ entries: BrodLogEntry[] }>(
      `/containers/${encodeURIComponent(id)}/logs?tail=${tail}`,
      { method: 'GET' },
      30_000
    );
    return body.entries ?? [];
  }

  containerStats(id: string): Promise<BrodContainerStats> {
    return this.request(
      `/containers/${encodeURIComponent(id)}/stats`,
      { method: 'GET' },
      30_000
    );
  }
}

/**
 * Encodes a repository name for a URL path.
 *
 * A name may contain slashes ("team/app"), and those are real path separators
 * that Brod's route expects. Only the individual components are escaped, so
 * encodeURIComponent on the whole string would break namespaced repositories.
 */
function encodeRepositoryName(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/');
}

let singleton: BrodClient | null = null;

/** Returns the shared client. */
export function getBrodClient(): BrodClient {
  if (!singleton) {
    singleton = new BrodClient();
  }
  return singleton;
}

/** Test seam: drops the cached client so env changes take effect. */
export function resetBrodClient(): void {
  singleton = null;
}
