/**
 * Red API client.
 *
 * An SQS-shaped message queue: queues, messages with at-least-once delivery via
 * visibility timeouts, dead-letter queues, and backups, proxied through Strapi.
 */

import { apiClient } from './client';

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

export interface CreateQueueInput {
  name: string;
  visibility_timeout_seconds?: number;
  message_retention_seconds?: number;
  max_receive_count?: number;
  dead_letter_queue?: string;
}

async function get<T>(path: string): Promise<T> {
  const response = await apiClient.get<{ data: T }>(`/red${path}`);
  return response.data.data;
}

export const redApi = {
  health: () => get<RedHealth>('/health'),

  // Queues
  listQueues: () => get<RedQueue[]>('/queues'),
  getQueue: (name: string) => get<RedQueue>(`/queues/${encodeURIComponent(name)}`),
  createQueue: async (input: CreateQueueInput): Promise<RedQueue> => {
    const response = await apiClient.post<{ data: RedQueue }>('/red/queues', input);
    return response.data.data;
  },
  deleteQueue: async (name: string): Promise<void> => {
    await apiClient.delete(`/red/queues/${encodeURIComponent(name)}`);
  },
  updateQueue: async (name: string, patch: Partial<CreateQueueInput>): Promise<RedQueue> => {
    // The proxy returns the queue flat under `data`, matching createQueue.
    const response = await apiClient.patch<{ data: RedQueue }>(`/red/queues/${encodeURIComponent(name)}`, patch);
    return response.data.data;
  },
  stats: (name: string) => get<RedQueueStats>(`/queues/${encodeURIComponent(name)}/stats`),
  purge: async (name: string): Promise<{ purged: number }> => {
    const response = await apiClient.post<{ data: { purged: number } }>(
      `/red/queues/${encodeURIComponent(name)}/purge`,
      {}
    );
    return response.data.data;
  },

  // Messages
  sendMessage: async (queue: string, body: string, attributes?: Record<string, string>): Promise<{ message_id: string }> => {
    const response = await apiClient.post<{ data: { message_id: string } }>(
      `/red/queues/${encodeURIComponent(queue)}/messages`,
      { body, attributes }
    );
    return response.data.data;
  },
  receive: async (
    queue: string,
    opts?: { max_messages?: number; wait_time_seconds?: number; visibility_timeout_seconds?: number }
  ): Promise<{ messages: RedMessage[]; count: number }> => {
    const response = await apiClient.post<{ data: { messages: RedMessage[]; count: number } }>(
      `/red/queues/${encodeURIComponent(queue)}/messages/receive`,
      opts ?? {}
    );
    return response.data.data;
  },
  deleteMessage: async (queue: string, receiptHandle: string): Promise<void> => {
    await apiClient.post(`/red/queues/${encodeURIComponent(queue)}/messages/delete`, {
      receipt_handle: receiptHandle,
    });
  },

  // Backups
  listBackups: (queue?: string) =>
    queue ? get<RedBackup[]>(`/queues/${encodeURIComponent(queue)}/backups`) : get<RedBackup[]>('/backups'),
  createBackup: async (queue: string): Promise<RedBackup> => {
    const response = await apiClient.post<{ data: RedBackup }>(
      `/red/queues/${encodeURIComponent(queue)}/backups`,
      {}
    );
    return response.data.data;
  },
  deleteBackup: async (id: string): Promise<void> => {
    await apiClient.delete(`/red/backups/${encodeURIComponent(id)}`);
  },
  restoreBackup: async (input: { backup_id: string; target_queue?: string; confirm: boolean }): Promise<unknown> => {
    const response = await apiClient.post('/red/backups/restore', input);
    return response.data;
  },

  // Subscriptions (Impuls triggers)
  listSubscriptions: () => get<RedSubscription[]>('/subscriptions'),
  createSubscription: async (input: { name: string; queue: string; function: string; batch_size?: number }): Promise<RedSubscription> => {
    const response = await apiClient.post<{ data: { subscription: RedSubscription } }>('/red/subscriptions', input);
    return response.data.data.subscription;
  },
  deleteSubscription: async (name: string): Promise<void> => {
    await apiClient.delete(`/red/subscriptions/${encodeURIComponent(name)}`);
  },
  updateSubscription: async (name: string, patch: { enabled?: boolean; batch_size?: number }): Promise<RedSubscription> => {
    const response = await apiClient.patch<{ data: { subscription: RedSubscription } }>(`/red/subscriptions/${encodeURIComponent(name)}`, patch);
    return response.data.data.subscription;
  },
};

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

/** A short human duration from seconds, e.g. 30s, 5m, 4d. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
