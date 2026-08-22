/**
 * Telemetry API client.
 *
 * Wraps the read-only `/telemetry/*` endpoints that serve logs, metrics,
 * traces and the audit trail out of the ClickHouse store.
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Time ranges
// ---------------------------------------------------------------------------

/** Relative windows the API understands directly. */
export const TIME_RANGES = [
  { value: '15m', label: 'Last 15 minutes' },
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
] as const;

export type TimeRangeValue = (typeof TIME_RANGES)[number]['value'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TelemetryHealth {
  configured: boolean;
  reachable: boolean;
  tables: string[];
  error?: string;
}

export interface TelemetrySummary {
  logs: { total: number; errors: number };
  requests: { total: number; errors: number; errorRate: number; p95Ms: number };
  services: number;
  topErrorServices: Array<{ service: string; count: number }>;
}

export interface ServiceInfo {
  service: string;
  signals: string[];
}

export interface ServiceStats {
  service: string;
  requests: number;
  errors: number;
  errorRate: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  lastSeen: string;
}

export interface LogRecord {
  timestampMs: number;
  service: string;
  severityText: string;
  severityNumber: number;
  body: string;
  traceId: string;
  spanId: string;
  attributes: Record<string, string>;
  resourceAttributes: Record<string, string>;
}

export interface LogSearchResult {
  rows: LogRecord[];
  total: number;
  limit: number;
  offset: number;
  range: { from: string; to: string };
}

export interface HistogramBucket {
  bucket: string;
  severityText: string;
  count: number;
}

export interface AuditRecord {
  timestampMs: number;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  resourceName: string | null;
  status: string;
  userId: string | null;
  userEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  traceId: string | null;
  service: string;
  details: Record<string, string>;
}

export interface AuditResult {
  rows: AuditRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface TraceSummary {
  traceId: string;
  spanId: string;
  timestamp: string;
  service: string;
  name: string;
  durationMs: number;
  statusCode: string;
  statusMessage: string;
  httpStatus: string;
  httpMethod: string;
  httpRoute: string;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  service: string;
  name: string;
  kind: string;
  startMs: number;
  durationMs: number;
  statusCode: string;
  statusMessage: string;
  attributes: Record<string, string>;
  eventTimestamps: string[];
  eventNames: string[];
  eventAttributes: Array<Record<string, string>>;
}

export interface ServiceMapEdge {
  source: string;
  target: string;
  calls: number;
  errorCalls: number;
  p95Ms: number;
}

export interface RequestPoint {
  bucket: string;
  service: string;
  requests: number;
  errors: number;
  p95Ms: number;
  avgMs: number;
}

export interface EndpointStats {
  service: string;
  endpoint: string;
  requests: number;
  errors: number;
  p95Ms: number;
  avgMs: number;
}

export interface MetricInfo {
  name: string;
  type: string;
  unit: string;
  description: string;
  service: string;
}

export interface MetricPoint {
  bucket: string;
  series: string;
  value?: number;
  min?: number;
  max?: number;
  count?: number;
  avg?: number;
}

export interface ContainerUsage {
  container: string;
  memoryMb: number;
  cpuPercent: number;
}

export interface StorageStat {
  table: string;
  rows: string;
  diskSize: string;
  diskBytes: string;
}

// ---------------------------------------------------------------------------
// Query building
// ---------------------------------------------------------------------------

export interface BaseParams {
  range?: TimeRangeValue | string;
  from?: number;
  to?: number;
}

export interface LogQueryParams extends BaseParams {
  services?: string[];
  severities?: string[];
  minSeverity?: number;
  search?: string;
  traceId?: string;
  /** Exact attribute matches, sent as `attr.<key>`. */
  attributes?: Record<string, string>;
  auditOnly?: boolean;
  action?: string;
  userId?: string;
  limit?: number;
  offset?: number;
  buckets?: number;
}

function toQuery(params: object = {}): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;

    if (key === 'attributes' && typeof value === 'object') {
      // Attribute filters travel under an `attr.` prefix so arbitrary
      // attribute names cannot collide with the endpoint's own parameters.
      for (const [attrKey, attrValue] of Object.entries(value as Record<string, string>)) {
        if (attrValue) search.set(`attr.${attrKey}`, attrValue);
      }
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
      continue;
    }

    search.set(key, String(value));
  }

  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Unwraps Strapi's `{ data: ... }` envelope. */
async function get<T>(path: string, params?: object): Promise<T> {
  const response = await apiClient.get<{ data: T }>(`/telemetry${path}${toQuery(params)}`);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const telemetryApi = {
  health: () => get<TelemetryHealth>('/health'),

  summary: (params: BaseParams = {}) => get<TelemetrySummary>('/summary', params),

  services: (params: BaseParams = {}) => get<ServiceInfo[]>('/services', params),

  serviceOverview: (params: BaseParams = {}) => get<ServiceStats[]>('/service-overview', params),

  serviceMap: (params: BaseParams = {}) => get<ServiceMapEdge[]>('/service-map', params),

  logs: (params: LogQueryParams = {}) => get<LogSearchResult>('/logs', params),

  logHistogram: (params: LogQueryParams = {}) => get<HistogramBucket[]>('/logs/histogram', params),

  logFields: (params: LogQueryParams = {}) =>
    get<Array<{ key: string; count: number }>>('/logs/fields', params),

  logFieldValues: (key: string, params: LogQueryParams = {}) =>
    get<Array<{ value: string; count: number }>>(
      `/logs/fields/${encodeURIComponent(key)}/values`,
      params
    ),

  audit: (params: LogQueryParams = {}) => get<AuditResult>('/audit', params),

  traces: (
    params: BaseParams & {
      services?: string[];
      spanName?: string;
      minDurationMs?: number;
      errorsOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ) => get<{ rows: TraceSummary[]; total: number }>('/traces', params),

  trace: (traceId: string) => get<{ traceId: string; spans: TraceSpan[] }>(`/traces/${traceId}`),

  requestTimeseries: (params: BaseParams & { services?: string[]; buckets?: number } = {}) =>
    get<RequestPoint[]>('/timeseries/requests', params),

  endpoints: (params: BaseParams & { services?: string[]; limit?: number } = {}) =>
    get<EndpointStats[]>('/endpoints', params),

  metrics: (params: BaseParams = {}) => get<MetricInfo[]>('/metrics', params),

  metricQuery: (
    params: BaseParams & {
      name: string;
      type?: string;
      services?: string[];
      groupBy?: string;
      attributes?: Record<string, string>;
      buckets?: number;
    }
  ) => get<MetricPoint[]>('/metrics/query', params),

  containers: (params: BaseParams = {}) => get<ContainerUsage[]>('/containers', params),

  storage: () => get<StorageStat[]>('/storage'),
};

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** OTel severity numbers, for the "minimum severity" filter. */
export const SEVERITY_LEVELS = [
  { value: 0, label: 'All levels' },
  { value: 5, label: 'Debug and above' },
  { value: 9, label: 'Info and above' },
  { value: 13, label: 'Warn and above' },
  { value: 17, label: 'Error only' },
] as const;

/**
 * Maps a severity to a status colour.
 *
 * Status colours are reserved and never reused as a series colour, and are
 * always shown next to the severity label so meaning is never colour-alone.
 */
export function severityColor(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'FATAL':
    case 'ERROR':
      return 'var(--status-critical)';
    case 'WARN':
    case 'WARNING':
      return 'var(--status-warning)';
    case 'INFO':
      return 'var(--chart-1)';
    case 'DEBUG':
    case 'TRACE':
      return 'var(--chart-axis)';
    default:
      return 'var(--chart-axis)';
  }
}

export function severityBadgeClass(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'FATAL':
    case 'ERROR':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    case 'WARN':
    case 'WARNING':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
    case 'INFO':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

/** Formats a duration for axis ticks and table cells. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '-';
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 2 : 0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
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

/**
 * Accepts a string as well as a number: ClickHouse serialises 64-bit integers
 * as JSON strings, and while the API coerces them, being tolerant here means a
 * missed field renders a readable value instead of "Invalid Date".
 */
export function formatTimestamp(ms: number | string): string {
  return new Date(Number(ms)).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatClockTime(ms: number | string): string {
  return new Date(Number(ms)).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Assigns a categorical colour slot to a series name.
 *
 * The mapping is by position in a stable, sorted key list rather than by rank,
 * so filtering out one service does not repaint the others.
 */
export function seriesColor(name: string, allNames: string[]): string {
  const index = [...allNames].sort().indexOf(name);
  const slot = index < 0 ? 0 : index % 8;
  return `var(--chart-${slot + 1})`;
}
