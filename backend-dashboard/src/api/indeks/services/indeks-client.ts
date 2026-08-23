/**
 * Indeks Key/Value Store Client
 * HTTP client for the Indeks service (DynamoDB-shaped tables, items, backups).
 */

export type KeyType = 'S' | 'N';

export interface IndeksKeySchema {
  partition_key: string;
  partition_type: KeyType;
  sort_key?: string;
  sort_type?: KeyType;
}

export interface IndeksTable {
  name: string;
  keys: IndeksKeySchema;
  item_count: number;
  size_bytes: number;
  created_at: string;
}

export type IndeksItem = Record<string, unknown>;

export interface IndeksQueryResult {
  items: IndeksItem[];
  count: number;
  scanned_count: number;
}

export interface IndeksBackup {
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

export class IndeksError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'IndeksError';
  }
}

export class IndeksClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;

  constructor(baseUrl?: string, apiKey?: string, timeoutMs = 30_000) {
    this.baseUrl = (baseUrl || process.env.INDEKS_URL || 'http://localhost:8086').replace(/\/$/, '');
    this.apiKey = apiKey || process.env.INDEKS_API_KEY;
    this.timeoutMs = timeoutMs;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v1${path}`, { ...init, headers, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new IndeksError(`Indeks request timed out after ${this.timeoutMs}ms`, 504);
      }
      throw new IndeksError(
        `Indeks is unreachable: ${error instanceof Error ? error.message : String(error)}`,
        503
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    if (!response.ok) {
      let message = text.slice(0, 500);
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error) message = parsed.error;
      } catch {
        // keep the raw text
      }
      throw new IndeksError(message, response.status);
    }
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  async health(): Promise<IndeksHealth> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      return (await response.json()) as IndeksHealth;
    } catch {
      return { service: 'indeks', status: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }

  // --- Tables ---------------------------------------------------------------

  async listTables(): Promise<IndeksTable[]> {
    const body = await this.request<{ tables: IndeksTable[] }>('/tables', { method: 'GET' });
    return body.tables ?? [];
  }

  async getTable(name: string): Promise<IndeksTable> {
    const body = await this.request<{ table: IndeksTable }>(`/tables/${encodeURIComponent(name)}`, { method: 'GET' });
    return body.table;
  }

  async createTable(req: Record<string, unknown>): Promise<IndeksTable> {
    const body = await this.request<{ table: IndeksTable }>('/tables', { method: 'POST', body: JSON.stringify(req) });
    return body.table;
  }

  deleteTable(name: string): Promise<void> {
    return this.request(`/tables/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }

  // --- Items ----------------------------------------------------------------

  async putItem(table: string, item: IndeksItem): Promise<IndeksItem> {
    const body = await this.request<{ item: IndeksItem }>(
      `/tables/${encodeURIComponent(table)}/items`,
      { method: 'PUT', body: JSON.stringify({ item }) }
    );
    return body.item;
  }

  async getItem(table: string, partitionValue: unknown, sortValue?: unknown): Promise<IndeksItem> {
    const body = await this.request<{ item: IndeksItem }>(
      `/tables/${encodeURIComponent(table)}/get`,
      { method: 'POST', body: JSON.stringify({ partition_value: partitionValue, sort_value: sortValue }) }
    );
    return body.item;
  }

  deleteItem(table: string, partitionValue: unknown, sortValue?: unknown): Promise<void> {
    return this.request(`/tables/${encodeURIComponent(table)}/delete`, {
      method: 'POST',
      body: JSON.stringify({ partition_value: partitionValue, sort_value: sortValue }),
    });
  }

  query(table: string, req: Record<string, unknown>): Promise<IndeksQueryResult> {
    return this.request(`/tables/${encodeURIComponent(table)}/query`, { method: 'POST', body: JSON.stringify(req) });
  }

  scan(table: string, limit?: number): Promise<IndeksQueryResult> {
    const q = limit ? `?limit=${limit}` : '';
    return this.request(`/tables/${encodeURIComponent(table)}/scan${q}`, { method: 'GET' });
  }

  // --- Backups --------------------------------------------------------------

  async listBackups(table?: string): Promise<IndeksBackup[]> {
    const path = table ? `/tables/${encodeURIComponent(table)}/backups` : '/backups';
    const body = await this.request<{ backups: IndeksBackup[] }>(path, { method: 'GET' });
    return body.backups ?? [];
  }

  createBackup(table: string): Promise<IndeksBackup> {
    return this.request(`/tables/${encodeURIComponent(table)}/backups`, { method: 'POST' });
  }

  deleteBackup(id: string): Promise<void> {
    return this.request(`/backups/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  restoreBackup(req: { backup_id: string; target_table?: string; confirm: boolean }): Promise<unknown> {
    return this.request('/backups/restore', { method: 'POST', body: JSON.stringify(req) });
  }
}

let singleton: IndeksClient | null = null;

export function getIndeksClient(): IndeksClient {
  if (!singleton) singleton = new IndeksClient();
  return singleton;
}

export function resetIndeksClient(): void {
  singleton = null;
}
