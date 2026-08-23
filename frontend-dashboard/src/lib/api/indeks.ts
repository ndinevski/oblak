/**
 * Indeks API client.
 *
 * A DynamoDB-shaped key/value and document store: tables with a partition key
 * (and optional sort key), items, queries, and backups, proxied through Strapi.
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KeyType = 'S' | 'N';

export interface KeySchema {
  partition_key: string;
  partition_type: KeyType;
  sort_key?: string;
  sort_type?: KeyType;
}

export interface IndeksTable {
  name: string;
  keys: KeySchema;
  item_count: number;
  size_bytes: number;
  created_at: string;
}

export type Item = Record<string, unknown>;

export interface QueryResult {
  items: Item[];
  count: number;
  scanned_count: number;
}

export type SortOp = 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'between' | 'begins_with';

export interface SortCondition {
  op: SortOp;
  value: unknown;
  value2?: unknown;
}

export interface QueryInput {
  partition_value: unknown;
  sort?: SortCondition;
  limit?: number;
  descending?: boolean;
}

export interface Backup {
  id: string;
  table: string;
  item_count: number;
  size_bytes: number;
  created_at: string;
}

export interface IndeksHealth {
  service: string;
  status: string;
  store?: string;
  tables?: number;
}

export interface CreateTableInput {
  name: string;
  partition_key: string;
  partition_type?: KeyType;
  sort_key?: string;
  sort_type?: KeyType;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

async function get<T>(path: string): Promise<T> {
  const response = await apiClient.get<{ data: T }>(`/indeks${path}`);
  return response.data.data;
}

export const indeksApi = {
  health: () => get<IndeksHealth>('/health'),

  // Tables
  listTables: () => get<IndeksTable[]>('/tables'),
  getTable: (name: string) => get<IndeksTable>(`/tables/${encodeURIComponent(name)}`),
  createTable: async (input: CreateTableInput): Promise<IndeksTable> => {
    const response = await apiClient.post<{ data: IndeksTable }>('/indeks/tables', input);
    return response.data.data;
  },
  deleteTable: async (name: string): Promise<void> => {
    await apiClient.delete(`/indeks/tables/${encodeURIComponent(name)}`);
  },

  // Items
  putItem: async (table: string, item: Item): Promise<Item> => {
    const response = await apiClient.put<{ data: Item }>(
      `/indeks/tables/${encodeURIComponent(table)}/items`,
      { item }
    );
    return response.data.data;
  },
  getItem: async (table: string, partitionValue: unknown, sortValue?: unknown): Promise<Item> => {
    const response = await apiClient.post<{ data: Item }>(
      `/indeks/tables/${encodeURIComponent(table)}/get`,
      { partition_value: partitionValue, sort_value: sortValue }
    );
    return response.data.data;
  },
  deleteItem: async (table: string, partitionValue: unknown, sortValue?: unknown): Promise<void> => {
    await apiClient.post(`/indeks/tables/${encodeURIComponent(table)}/delete`, {
      partition_value: partitionValue,
      sort_value: sortValue,
    });
  },
  query: async (table: string, input: QueryInput): Promise<QueryResult> => {
    const response = await apiClient.post<{ data: QueryResult }>(
      `/indeks/tables/${encodeURIComponent(table)}/query`,
      input
    );
    return response.data.data;
  },
  scan: async (table: string, limit?: number): Promise<QueryResult> => {
    const q = limit ? `?limit=${limit}` : '';
    const response = await apiClient.get<{ data: QueryResult }>(
      `/indeks/tables/${encodeURIComponent(table)}/scan${q}`
    );
    return response.data.data;
  },

  // Backups
  listBackups: (table?: string) =>
    table
      ? get<Backup[]>(`/tables/${encodeURIComponent(table)}/backups`)
      : get<Backup[]>('/backups'),
  createBackup: async (table: string): Promise<Backup> => {
    const response = await apiClient.post<{ data: Backup }>(
      `/indeks/tables/${encodeURIComponent(table)}/backups`,
      {}
    );
    return response.data.data;
  },
  deleteBackup: async (id: string): Promise<void> => {
    await apiClient.delete(`/indeks/backups/${encodeURIComponent(id)}`);
  },
  restoreBackup: async (input: { backup_id: string; target_table?: string; confirm: boolean }): Promise<unknown> => {
    const response = await apiClient.post('/indeks/backups/restore', input);
    return response.data;
  },
};

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export function keyTypeLabel(t: KeyType | undefined): string {
  return t === 'N' ? 'Number' : 'String';
}

/** A short human description of a table's key schema. */
export function keySchemaSummary(keys: KeySchema): string {
  const pk = `${keys.partition_key} (${keyTypeLabel(keys.partition_type)})`;
  if (keys.sort_key) {
    return `${pk} + ${keys.sort_key} (${keyTypeLabel(keys.sort_type)})`;
  }
  return pk;
}

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
