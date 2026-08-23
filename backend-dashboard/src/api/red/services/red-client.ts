/**
 * Red Message Queue Client
 * HTTP client for the Red service (SQS-shaped queues, messages, backups).
 */

export interface RedQueue {
  name: string;
  visibility_timeout_seconds: number;
  message_retention_seconds: number;
  max_receive_count?: number;
  dead_letter_queue?: string;
  created_at: string;
  visible_messages: number;
  in_flight_messages: number;
}

export interface RedMessage {
  id: string;
  body: string;
  attributes?: Record<string, string>;
  receive_count: number;
  enqueued_at: number;
  receipt_handle?: string;
}

export interface RedQueueStats {
  queue: string;
  visible_messages: number;
  in_flight_messages: number;
  oldest_message_age_seconds: number;
}

export interface RedBackup {
  id: string;
  queue: string;
  message_count: number;
  size_bytes: number;
  created_at: string;
}

export interface RedSubscription {
  name: string;
  queue: string;
  function: string;
  batch_size: number;
  enabled: boolean;
  created_at: string;
  delivered_total: number;
  failed_total: number;
  last_error?: string;
  last_delivery_at?: string;
}

export interface RedHealth {
  service: string;
  status: string;
  store?: string;
  queues?: number;
}

export class RedError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'RedError';
  }
}

export class RedClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;

  constructor(baseUrl?: string, apiKey?: string, timeoutMs = 30_000) {
    this.baseUrl = (baseUrl || process.env.RED_URL || 'http://localhost:8087').replace(/\/$/, '');
    this.apiKey = apiKey || process.env.RED_API_KEY;
    this.timeoutMs = timeoutMs;
  }

  private async request<T>(path: string, init: RequestInit = {}, timeoutMs = this.timeoutMs): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v1${path}`, { ...init, headers, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new RedError(`Red request timed out after ${timeoutMs}ms`, 504);
      throw new RedError(`Red is unreachable: ${error instanceof Error ? error.message : String(error)}`, 503);
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
        // keep raw
      }
      throw new RedError(message, response.status);
    }
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  async health(): Promise<RedHealth> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      return (await response.json()) as RedHealth;
    } catch {
      return { service: 'red', status: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }

  // Queues
  async listQueues(): Promise<RedQueue[]> {
    const body = await this.request<{ queues: RedQueue[] }>('/queues', { method: 'GET' });
    return body.queues ?? [];
  }
  async getQueue(name: string): Promise<RedQueue> {
    const body = await this.request<{ queue: RedQueue }>(`/queues/${encodeURIComponent(name)}`, { method: 'GET' });
    return body.queue;
  }
  async createQueue(req: Record<string, unknown>): Promise<RedQueue> {
    const body = await this.request<{ queue: RedQueue }>('/queues', { method: 'POST', body: JSON.stringify(req) });
    return body.queue;
  }
  deleteQueue(name: string): Promise<void> {
    return this.request(`/queues/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }
  async updateQueue(name: string, req: Record<string, unknown>): Promise<RedQueue> {
    const body = await this.request<{ queue: RedQueue }>(`/queues/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(req) });
    return body.queue;
  }
  stats(name: string): Promise<RedQueueStats> {
    return this.request(`/queues/${encodeURIComponent(name)}/stats`, { method: 'GET' });
  }
  purge(name: string): Promise<{ purged: number }> {
    return this.request(`/queues/${encodeURIComponent(name)}/purge`, { method: 'POST' });
  }

  // Messages
  sendMessage(queue: string, req: Record<string, unknown>): Promise<{ message_id: string }> {
    return this.request(`/queues/${encodeURIComponent(queue)}/messages`, { method: 'POST', body: JSON.stringify(req) });
  }
  receive(queue: string, req: Record<string, unknown>): Promise<{ messages: RedMessage[]; count: number }> {
    // Long polling can hold the response; give it headroom over the wait time.
    return this.request(`/queues/${encodeURIComponent(queue)}/messages/receive`, { method: 'POST', body: JSON.stringify(req) }, 60_000);
  }
  deleteMessage(queue: string, receiptHandle: string): Promise<void> {
    return this.request(`/queues/${encodeURIComponent(queue)}/messages/delete`, {
      method: 'POST',
      body: JSON.stringify({ receipt_handle: receiptHandle }),
    });
  }

  // Subscriptions
  async listSubscriptions(): Promise<RedSubscription[]> {
    const body = await this.request<{ subscriptions: RedSubscription[] }>('/subscriptions', { method: 'GET' });
    return body.subscriptions ?? [];
  }
  createSubscription(req: Record<string, unknown>): Promise<{ subscription: RedSubscription }> {
    return this.request('/subscriptions', { method: 'POST', body: JSON.stringify(req) });
  }
  deleteSubscription(name: string): Promise<void> {
    return this.request(`/subscriptions/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }
  async updateSubscription(name: string, req: Record<string, unknown>): Promise<{ subscription: RedSubscription }> {
    return this.request(`/subscriptions/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(req) });
  }

  // Backups
  async listBackups(queue?: string): Promise<RedBackup[]> {
    const path = queue ? `/queues/${encodeURIComponent(queue)}/backups` : '/backups';
    const body = await this.request<{ backups: RedBackup[] }>(path, { method: 'GET' });
    return body.backups ?? [];
  }
  createBackup(queue: string): Promise<RedBackup> {
    return this.request(`/queues/${encodeURIComponent(queue)}/backups`, { method: 'POST' });
  }
  deleteBackup(id: string): Promise<void> {
    return this.request(`/backups/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  restoreBackup(req: { backup_id: string; target_queue?: string; confirm: boolean }): Promise<unknown> {
    return this.request('/backups/restore', { method: 'POST', body: JSON.stringify(req) });
  }
}

let singleton: RedClient | null = null;
export function getRedClient(): RedClient {
  if (!singleton) singleton = new RedClient();
  return singleton;
}
export function resetRedClient(): void {
  singleton = null;
}
