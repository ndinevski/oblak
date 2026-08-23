/**
 * Tefter API client.
 *
 * Managed PostgreSQL and MySQL databases, their read replicas and backups,
 * proxied through Strapi.
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Engine = 'postgres' | 'mysql';

export type InstanceStatus =
  | 'creating'
  | 'available'
  | 'stopped'
  | 'starting'
  | 'stopping'
  | 'restoring'
  | 'failed'
  | 'unknown';

export type InstanceRole = 'primary' | 'replica';

export interface DBInstance {
  id: string;
  name: string;
  /** Stable identity, unique to this instance even if the name is later reused. */
  uid?: string;
  engine: Engine;
  role: InstanceRole;
  version: string;
  image: string;
  size: string;
  status: InstanceStatus;
  status_detail?: string;
  host: string;
  port: number;
  database: string;
  username: string;
  source_instance?: string;
  replicas?: string[];
  cpu_limit?: number;
  memory_limit?: number;
  created_at: string;
  started_at?: string;
  error?: string;
}

export interface CreateInstanceInput {
  name: string;
  engine: Engine;
  version?: string;
  size?: string;
  database?: string;
  username?: string;
  password?: string;
}

export interface CreateInstanceResult {
  instance: DBInstance;
  /** Shown once, on creation. It cannot be recovered afterwards. */
  password: string;
  note?: string;
}

export type ReplicationState = 'streaming' | 'catchup' | 'stopped' | 'error' | 'unknown';

export interface ReplicationStatus {
  instance: string;
  source_instance?: string;
  state: ReplicationState;
  lag_seconds?: number;
  lag_bytes?: number;
  detail?: string;
  checked_at: string;
  role?: InstanceRole;
  note?: string;
}

export type BackupType = 'manual' | 'automated' | 'pre-restore';
export type BackupStatus = 'running' | 'available' | 'failed';

export interface Backup {
  id: string;
  instance: string;
  /** Identity of the instance this backup came from (see DBInstance.uid). */
  instance_uid?: string;
  /** True when no live instance shares this backup's identity any more. */
  from_deleted_instance?: boolean;
  engine: Engine;
  database: string;
  status: BackupStatus;
  type: BackupType;
  description?: string;
  size_bytes: number;
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  error?: string;
}

export interface RestoreResult {
  backup_id: string;
  target_instance: string;
  restored: boolean;
  duration_seconds: number;
  pre_restore_backup_id?: string;
}

export interface EngineInfo {
  engine: Engine;
  version: string;
  image: string;
  default?: boolean;
}

export interface SizeInfo {
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

export interface RestoreInput {
  backup_id: string;
  target_instance?: string;
  confirm: boolean;
  skip_pre_restore_backup?: boolean;
  /**
   * Required to restore a backup into an instance it was not taken from,
   * including a new instance that reuses a deleted one's name.
   */
  allow_different_instance?: boolean;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Unwraps Strapi's `{ data: ... }` envelope. */
async function get<T>(path: string): Promise<T> {
  const response = await apiClient.get<{ data: T }>(`/tefter${path}`);
  return response.data.data;
}

export const tefterApi = {
  health: () => get<TefterHealth>('/health'),
  engines: () => get<EngineInfo[]>('/engines'),
  sizes: () => get<SizeInfo[]>('/sizes'),

  // --- Instances ------------------------------------------------------------

  listInstances: () => get<DBInstance[]>('/instances'),

  getInstance: (name: string) => get<DBInstance>(`/instances/${encodeURIComponent(name)}`),

  createInstance: async (input: CreateInstanceInput): Promise<CreateInstanceResult> => {
    const response = await apiClient.post<{ data: CreateInstanceResult }>(
      '/tefter/instances',
      input
    );
    return response.data.data;
  },

  deleteInstance: async (name: string): Promise<void> => {
    await apiClient.delete(`/tefter/instances/${encodeURIComponent(name)}`);
  },

  startInstance: async (name: string): Promise<DBInstance> => {
    const response = await apiClient.post<{ data: { instance: DBInstance } }>(
      `/tefter/instances/${encodeURIComponent(name)}/start`,
      {}
    );
    return response.data.data.instance;
  },

  stopInstance: async (name: string): Promise<DBInstance> => {
    const response = await apiClient.post<{ data: { instance: DBInstance } }>(
      `/tefter/instances/${encodeURIComponent(name)}/stop`,
      {}
    );
    return response.data.data.instance;
  },

  // --- Replicas -------------------------------------------------------------

  listReplicas: (name: string) =>
    get<DBInstance[]>(`/instances/${encodeURIComponent(name)}/replicas`),

  createReplica: async (
    source: string,
    input: { name: string; size?: string }
  ): Promise<DBInstance> => {
    const response = await apiClient.post<{ data: { replica: DBInstance } }>(
      `/tefter/instances/${encodeURIComponent(source)}/replicas`,
      input
    );
    return response.data.data.replica;
  },

  replicationStatus: (name: string) =>
    get<ReplicationStatus>(`/instances/${encodeURIComponent(name)}/replication`),

  promoteReplica: async (name: string): Promise<DBInstance> => {
    const response = await apiClient.post<{ data: { instance: DBInstance } }>(
      `/tefter/instances/${encodeURIComponent(name)}/promote`,
      {}
    );
    return response.data.data.instance;
  },

  // --- Backups --------------------------------------------------------------

  listBackups: (instance?: string) =>
    instance
      ? get<Backup[]>(`/instances/${encodeURIComponent(instance)}/backups`)
      : get<Backup[]>('/backups'),

  createBackup: async (instance: string, description?: string): Promise<Backup> => {
    const response = await apiClient.post<{ data: Backup }>(
      `/tefter/instances/${encodeURIComponent(instance)}/backups`,
      { description }
    );
    return response.data.data;
  },

  deleteBackup: async (id: string): Promise<void> => {
    await apiClient.delete(`/tefter/backups/${encodeURIComponent(id)}`);
  },

  restoreBackup: async (input: RestoreInput): Promise<RestoreResult> => {
    const response = await apiClient.post<{ data: RestoreResult }>(
      '/tefter/backups/restore',
      input
    );
    return response.data.data;
  },
};

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * Instance status styling.
 *
 * Every status is rendered with its label alongside the colour, so state is
 * never carried by colour alone.
 */
export function instanceStatusClass(status: InstanceStatus): string {
  switch (status) {
    case 'available':
      return 'bg-green-500/10 text-green-700 dark:text-green-500 border-green-500/20';
    case 'creating':
    case 'starting':
    case 'stopping':
    case 'restoring':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
    case 'failed':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    case 'stopped':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function instanceStatusLabel(status: InstanceStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Replication state styling. As with instance status, the label always travels
 * with the colour.
 */
export function replicationStateClass(state: ReplicationState): string {
  switch (state) {
    case 'streaming':
      return 'bg-green-500/10 text-green-700 dark:text-green-500 border-green-500/20';
    case 'catchup':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
    case 'error':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    case 'stopped':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function replicationStateLabel(state: ReplicationState): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function engineLabel(engine: Engine): string {
  return engine === 'postgres' ? 'PostgreSQL' : 'MySQL';
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

/**
 * Renders replication lag as a short human phrase.
 *
 * Zero is "In sync" rather than "0s": for a replica that is the answer the
 * reader wants, and an idle-but-healthy replica legitimately reports zero.
 */
export function formatLag(status: ReplicationStatus): string {
  if (status.state !== 'streaming' && status.state !== 'catchup') {
    return replicationStateLabel(status.state);
  }
  const secs = status.lag_seconds ?? 0;
  if (secs <= 0) return 'In sync';
  if (secs < 60) return `${secs.toFixed(secs < 10 ? 1 : 0)}s behind`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${Math.round(secs % 60)}s behind`;
}

/**
 * A client connection string for display. The password is never included: it
 * is shown once at creation and never returned again, so the string carries a
 * <password> placeholder, matching what the Tefter API itself renders.
 */
export function connectionString(instance: DBInstance): string {
  const scheme = instance.engine === 'postgres' ? 'postgresql' : 'mysql';
  return `${scheme}://${instance.username}:<password>@${instance.host}:${instance.port}/${instance.database}`;
}
