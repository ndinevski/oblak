/**
 * Alerts API client.
 *
 * Alert rules are configuration and live in Postgres; the firing history they
 * produce is read back out of the telemetry store.
 */

import { apiClient } from './client';

export type AlertState = 'ok' | 'pending' | 'firing' | 'unknown';
export type AlertSeverity = 'warning' | 'critical';
export type AlertComparison = 'gt' | 'lt';

export interface AlertRule {
  id: number;
  name: string;
  description?: string | null;
  enabled: boolean;
  ruleType: string;
  target?: string | null;
  comparison: AlertComparison;
  threshold: number;
  windowMinutes: number;
  forMinutes: number;
  severity: AlertSeverity;
  notifyWebhook?: string | null;
  notifyEmail?: string | null;
  notifyCooldownMinutes?: number | null;
  mutedUntil?: string | null;
  /** Derived by the backend so it cannot go stale as the mute expires. */
  isMuted?: boolean;
  state: AlertState;
  lastValue?: number | null;
  lastError?: string | null;
  breachingSince?: string | null;
  stateChangedAt?: string | null;
  lastEvaluatedAt?: string | null;
  /** Rendered by the backend so the UI does not duplicate the phrasing. */
  condition: string;
}

export interface AlertRuleType {
  value: string;
  label: string;
  unit: string;
  targetLabel: string | null;
  targetOptional: boolean;
  description: string;
}

export interface AlertRuleInput {
  name: string;
  description?: string;
  enabled?: boolean;
  ruleType: string;
  target?: string;
  comparison: AlertComparison;
  threshold: number;
  windowMinutes: number;
  forMinutes: number;
  severity: AlertSeverity;
  notifyWebhook?: string;
  notifyEmail?: string;
  notifyCooldownMinutes?: number;
}

export interface AlertHistoryEntry {
  timestampMs: number;
  rule: string;
  state: AlertState;
  previousState: AlertState;
  severity: AlertSeverity;
  condition: string;
  target: string;
  value: number | null;
}

export interface AlertTestResult {
  state: AlertState;
  value: number | null;
  error: string | null;
  condition: string;
  wouldFire: boolean;
}

export interface AlertListMeta {
  total: number;
  firing: number;
  pending: number;
  unknown: number;
}

export const alertsApi = {
  list: async (): Promise<{ rules: AlertRule[]; meta: AlertListMeta }> => {
    const response = await apiClient.get<{ data: AlertRule[]; meta: AlertListMeta }>(
      '/alert-rules'
    );
    return { rules: response.data.data, meta: response.data.meta };
  },

  types: async (): Promise<AlertRuleType[]> => {
    const response = await apiClient.get<{ data: AlertRuleType[] }>('/alert-rules/types');
    return response.data.data;
  },

  create: async (input: AlertRuleInput): Promise<AlertRule> => {
    const response = await apiClient.post<{ data: AlertRule }>('/alert-rules', input);
    return response.data.data;
  },

  update: async (id: number, input: Partial<AlertRuleInput>): Promise<AlertRule> => {
    const response = await apiClient.put<{ data: AlertRule }>(`/alert-rules/${id}`, input);
    return response.data.data;
  },

  remove: async (id: number): Promise<void> => {
    await apiClient.delete(`/alert-rules/${id}`);
  },

  /** Evaluates a draft rule without saving it. */
  test: async (input: Partial<AlertRuleInput>): Promise<AlertTestResult> => {
    const response = await apiClient.post<{ data: AlertTestResult }>('/alert-rules/test', input);
    return response.data.data;
  },

  /** Runs the whole evaluation pass now rather than waiting for the timer. */
  evaluateAll: async (): Promise<{ evaluated: number; changed: number; firing: number }> => {
    const response = await apiClient.post<{
      data: { evaluated: number; changed: number; firing: number };
    }>('/alert-rules/evaluate', {});
    return response.data.data;
  },

  /** Silences a rule for `minutes`, or lifts the silence when given 0/null. */
  mute: async (id: number, minutes: number | null): Promise<AlertRule> => {
    const response = await apiClient.post<{ data: AlertRule }>(`/alert-rules/${id}/mute`, {
      minutes,
    });
    return response.data.data;
  },

  history: async (hours = 24, limit = 100): Promise<AlertHistoryEntry[]> => {
    const response = await apiClient.get<{ data: AlertHistoryEntry[] }>(
      `/alert-rules/history?hours=${hours}&limit=${limit}`
    );
    return response.data.data;
  },
};

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/**
 * State styling.
 *
 * Every state ships with a text label alongside the colour, so an alert's
 * state never rests on colour alone.
 */
export function alertStateClass(state: AlertState, severity?: AlertSeverity): string {
  switch (state) {
    case 'firing':
      return severity === 'critical'
        ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
        : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
    case 'pending':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
    case 'ok':
      return 'bg-green-500/10 text-green-700 dark:text-green-500 border-green-500/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function alertStateLabel(state: AlertState): string {
  switch (state) {
    case 'firing':
      return 'Firing';
    case 'pending':
      return 'Pending';
    case 'ok':
      return 'OK';
    default:
      return 'Unknown';
  }
}

/** Formats an observed value with its rule type's unit. */
export function formatAlertValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return 'no data';
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
  return unit ? `${rounded} ${unit}` : String(rounded);
}
