/**
 * Tefter Database Client
 * HTTP client for communicating with the Tefter managed database service.
 */

// =============================================================================
// Types matching Tefter Go models
// =============================================================================

export type TefterEngine = 'postgres' | 'mysql';

export type TefterInstanceStatus =
  | 'creating'
  | 'available'
  | 'stopped'
  | 'starting'
  | 'stopping'
  | 'restoring'
  | 'failed'
  | 'unknown';

export type TefterRole = 'primary' | 'replica';

export interface TefterInstance {
  id: string;
  name: string;
  engine: TefterEngine;
  role: TefterRole;
  version: string;
  image: string;
  size: string;
  status: TefterInstanceStatus;
  status_detail?: string;
  host: string;
  port: number;
  database: string;
  username: string;
  /** Set on a replica: the primary it follows. */
  source_instance?: string;
  /** Set on a primary: the replicas that follow it. */
  replicas?: string[];
  cpu_limit?: number;
  memory_limit?: number;
  created_at: string;
  started_at?: string;
  error?: string;
}

export interface TefterCreateInstanceRequest {
  name: string;
  engine: TefterEngine;
  version?: string;
  size?: string;
  database?: string;
  username?: string;
  password?: string;
}

/**
 * The create response. The password is returned exactly once, at creation:
 * Tefter stores no credential store of its own, so it cannot be recovered
 * later.
 */
export interface TefterCreateInstanceResponse {
  instance: TefterInstance;
  /** Returned exactly once. Tefter keeps no credential store to recover it. */
  password: string;
  note?: string;
}

export type TefterReplicationState =
  | 'streaming'
  | 'catchup'
  | 'stopped'
  | 'error'
  | 'unknown';

export interface TefterReplicationStatus {
  instance: string;
  source_instance?: string;
  state: TefterReplicationState;
  /** How far behind the replica is, in seconds. Zero when caught up. */
  lag_seconds?: number;
  /** WAL/binlog bytes received but not yet applied. Postgres only. */
  lag_bytes?: number;
  detail?: string;
  checked_at: string;
  /** Present instead of the above when the instance queried is a primary. */
  role?: TefterRole;
  note?: string;
  replicas?: string[] | null;
}

export type TefterBackupType = 'manual' | 'automated' | 'pre-restore';
export type TefterBackupStatus = 'running' | 'available' | 'failed';

export interface TefterBackup {
  id: string;
  instance: string;
  engine: TefterEngine;
  database: string;
  status: TefterBackupStatus;
  type: TefterBackupType;
  description?: string;
  size_bytes: number;
  path?: string;
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  error?: string;
}

export interface TefterRestoreResult {
  backup_id: string;
  target_instance: string;
  restored: boolean;
  duration_seconds: number;
  /** The safety copy taken before overwriting, unless explicitly skipped. */
  pre_restore_backup_id?: string;
}

export interface TefterEngineInfo {
  engine: TefterEngine;
  version: string;
  image: string;
  /** True on the version chosen when none is specified for this engine. */
  default?: boolean;
}

export interface TefterSize {
  name: string;
  cpu: number;
  memory_mb: number;
  description?: string;
}

export interface TefterHealth {
  service: string;
  status: string;
  runtime: string;
  runtime_version?: string;
  instances?: number;
  runtime_error?: string;
}

// =============================================================================
// Client
// =============================================================================

export class TefterError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'TefterError';
  }
}

export class TefterClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;

  constructor(baseUrl?: string, apiKey?: string, timeoutMs = 300_000) {
    this.baseUrl = (baseUrl || process.env.TEFTER_URL || 'http://localhost:8084').replace(
      /\/$/,
      ''
    );
    this.apiKey = apiKey || process.env.TEFTER_API_KEY;
    // Generous by default: creating an instance pulls an engine image and
    // waits for first-time initialisation, and seeding a replica copies the
    // primary's whole dataset. Both legitimately take minutes.
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
        throw new TefterError(`Tefter request timed out after ${timeoutMs}ms`, 504);
      }
      throw new TefterError(
        `Tefter is unreachable: ${error instanceof Error ? error.message : String(error)}`,
        503
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();

    if (!response.ok) {
      // Tefter reports failures as {"error": "..."}; fall back to the raw body
      // when it is something else entirely (a proxy error page, say).
      let message = text.slice(0, 500);
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error) message = parsed.error;
        // A refused restore explains how to proceed; keep that with the error.
        if (parsed?.hint) message = `${message} (${parsed.hint})`;
      } catch {
        // keep the raw text
      }
      throw new TefterError(message, response.status);
    }

    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  // --- Service ---------------------------------------------------------------

  /**
   * Health, over the root path rather than /api/v1.
   *
   * Never throws: the dashboard renders "unavailable" rather than erroring,
   * and a 503 from a degraded Tefter still carries a useful body.
   */
  async health(): Promise<TefterHealth> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      return (await response.json()) as TefterHealth;
    } catch (error) {
      return {
        service: 'tefter',
        status: 'unavailable',
        runtime: 'unknown',
        runtime_error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async listEngines(): Promise<TefterEngineInfo[]> {
    const body = await this.request<{ engines: TefterEngineInfo[] }>('/engines', {
      method: 'GET',
    });
    return body.engines ?? [];
  }

  async listSizes(): Promise<TefterSize[]> {
    const body = await this.request<{ sizes: TefterSize[] }>('/sizes', { method: 'GET' });
    return body.sizes ?? [];
  }

  // --- Instances -------------------------------------------------------------

  async listInstances(): Promise<TefterInstance[]> {
    const body = await this.request<{ instances: TefterInstance[] }>('/instances', {
      method: 'GET',
    });
    return body.instances ?? [];
  }

  async getInstance(name: string): Promise<TefterInstance> {
    const body = await this.request<{ instance: TefterInstance }>(
      `/instances/${encodeURIComponent(name)}`,
      { method: 'GET' }
    );
    return body.instance;
  }

  createInstance(req: TefterCreateInstanceRequest): Promise<TefterCreateInstanceResponse> {
    return this.request('/instances', { method: 'POST', body: JSON.stringify(req) });
  }

  deleteInstance(name: string): Promise<void> {
    return this.request(`/instances/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }

  async startInstance(name: string): Promise<TefterInstance> {
    const body = await this.request<{ instance: TefterInstance }>(
      `/instances/${encodeURIComponent(name)}/start`,
      { method: 'POST' }
    );
    return body.instance;
  }

  async stopInstance(name: string): Promise<TefterInstance> {
    const body = await this.request<{ instance: TefterInstance }>(
      `/instances/${encodeURIComponent(name)}/stop`,
      { method: 'POST' }
    );
    return body.instance;
  }

  // --- Replicas --------------------------------------------------------------

  async listReplicas(name: string): Promise<TefterInstance[]> {
    const body = await this.request<{ replicas: TefterInstance[] }>(
      `/instances/${encodeURIComponent(name)}/replicas`,
      { method: 'GET' }
    );
    return body.replicas ?? [];
  }

  async createReplica(
    source: string,
    req: { name: string; size?: string }
  ): Promise<TefterInstance> {
    const body = await this.request<{ replica: TefterInstance }>(
      `/instances/${encodeURIComponent(source)}/replicas`,
      { method: 'POST', body: JSON.stringify(req) }
    );
    return body.replica;
  }

  replicationStatus(name: string): Promise<TefterReplicationStatus> {
    return this.request(`/instances/${encodeURIComponent(name)}/replication`, {
      method: 'GET',
    });
  }

  async promoteReplica(name: string): Promise<TefterInstance> {
    const body = await this.request<{ instance: TefterInstance }>(
      `/instances/${encodeURIComponent(name)}/promote`,
      { method: 'POST' }
    );
    return body.instance;
  }

  // --- Backups ---------------------------------------------------------------

  async listBackups(instance?: string): Promise<TefterBackup[]> {
    const path = instance
      ? `/instances/${encodeURIComponent(instance)}/backups`
      : '/backups';
    const body = await this.request<{ backups: TefterBackup[] }>(path, { method: 'GET' });
    return body.backups ?? [];
  }

  createBackup(instance: string, description?: string): Promise<TefterBackup> {
    return this.request(`/instances/${encodeURIComponent(instance)}/backups`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
  }

  getBackup(id: string): Promise<TefterBackup> {
    return this.request(`/backups/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  deleteBackup(id: string): Promise<void> {
    return this.request(`/backups/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  restoreBackup(req: {
    backup_id: string;
    target_instance?: string;
    confirm: boolean;
    skip_pre_restore_backup?: boolean;
  }): Promise<TefterRestoreResult> {
    return this.request('/backups/restore', { method: 'POST', body: JSON.stringify(req) });
  }
}

let singleton: TefterClient | null = null;

/** Returns the shared client. */
export function getTefterClient(): TefterClient {
  if (!singleton) {
    singleton = new TefterClient();
  }
  return singleton;
}

/** Test seam: drops the cached client so env changes take effect. */
export function resetTefterClient(): void {
  singleton = null;
}
