/**
 * Telemetry hooks.
 *
 * Observability data is time-windowed and constantly changing, so these
 * queries refetch on an interval rather than being cached indefinitely. The
 * time range is part of every query key so switching windows always refetches.
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  telemetryApi,
  type BaseParams,
  type LogQueryParams,
  type TimeRangeValue,
} from '@/lib/api/telemetry';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const telemetryKeys = {
  all: ['telemetry'] as const,
  health: () => [...telemetryKeys.all, 'health'] as const,
  summary: (p: unknown) => [...telemetryKeys.all, 'summary', p] as const,
  services: (p: unknown) => [...telemetryKeys.all, 'services', p] as const,
  serviceOverview: (p: unknown) => [...telemetryKeys.all, 'service-overview', p] as const,
  serviceMap: (p: unknown) => [...telemetryKeys.all, 'service-map', p] as const,
  logs: (p: unknown) => [...telemetryKeys.all, 'logs', p] as const,
  logHistogram: (p: unknown) => [...telemetryKeys.all, 'log-histogram', p] as const,
  logFields: (p: unknown) => [...telemetryKeys.all, 'log-fields', p] as const,
  logFieldValues: (k: string, p: unknown) =>
    [...telemetryKeys.all, 'log-field-values', k, p] as const,
  audit: (p: unknown) => [...telemetryKeys.all, 'audit', p] as const,
  traces: (p: unknown) => [...telemetryKeys.all, 'traces', p] as const,
  trace: (id: string) => [...telemetryKeys.all, 'trace', id] as const,
  requests: (p: unknown) => [...telemetryKeys.all, 'requests', p] as const,
  endpoints: (p: unknown) => [...telemetryKeys.all, 'endpoints', p] as const,
  metrics: (p: unknown) => [...telemetryKeys.all, 'metrics', p] as const,
  metricQuery: (p: unknown) => [...telemetryKeys.all, 'metric-query', p] as const,
  containers: (p: unknown) => [...telemetryKeys.all, 'containers', p] as const,
  storage: () => [...telemetryKeys.all, 'storage'] as const,
};

/**
 * Refresh cadence.
 *
 * Short windows imply the user is watching something happen, so they poll
 * faster; long windows change slowly and polling them hard would just load
 * the telemetry store for no benefit.
 */
export function refreshIntervalFor(range: string | undefined): number {
  switch (range) {
    case '15m':
      return 10_000;
    case '1h':
      return 30_000;
    case '6h':
      return 60_000;
    default:
      return 120_000;
  }
}

interface Options {
  enabled?: boolean;
  /** Set false to stop background polling (used by the live-tail toggle). */
  autoRefresh?: boolean;
}

function common(params: BaseParams, options?: Options) {
  // Annotated rather than inferred: without it the ternary widens to
  // `number | boolean`, which React Query's options type rejects.
  const refetchInterval: number | false = (options?.autoRefresh ?? true)
    ? refreshIntervalFor(params.range)
    : false;

  return {
    enabled: options?.enabled ?? true,
    refetchInterval,
    // Keeps the previous window on screen while the new one loads, so
    // changing a filter does not blank the whole page.
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Whether the telemetry store is configured and reachable. */
export function useTelemetryHealth() {
  return useQuery({
    queryKey: telemetryKeys.health(),
    queryFn: () => telemetryApi.health(),
    // Configuration does not change at runtime; no need to poll it hard.
    staleTime: 60_000,
    retry: false,
  });
}

export function useTelemetrySummary(params: BaseParams, options?: Options) {
  return useQuery({
    queryKey: telemetryKeys.summary(params),
    queryFn: () => telemetryApi.summary(params),
    ...common(params, options),
  });
}

export function useTelemetryServices(params: BaseParams, options?: Options) {
  return useQuery({
    queryKey: telemetryKeys.services(params),
    queryFn: () => telemetryApi.services(params),
    ...common(params, options),
  });
}

export function useServiceOverview(params: BaseParams, options?: Options) {
  return useQuery({
    queryKey: telemetryKeys.serviceOverview(params),
    queryFn: () => telemetryApi.serviceOverview(params),
    ...common(params, options),
  });
}

export function useServiceMap(params: BaseParams, options?: Options) {
  return useQuery({
    queryKey: telemetryKeys.serviceMap(params),
    queryFn: () => telemetryApi.serviceMap(params),
    ...common(params, options),
  });
}

export function useLogs(params: LogQueryParams, options?: Options) {
  return useQuery({
    queryKey: telemetryKeys.logs(params),
    queryFn: () => telemetryApi.logs(params),
    ...common(params, options),
  });
}

export function useLogHistogram(params: LogQueryParams, options?: Options) {
  return useQuery({
    queryKey: telemetryKeys.logHistogram(params),
    queryFn: () => telemetryApi.logHistogram(params),
    ...common(params, options),
  });
}

export function useLogFields(params: LogQueryParams, options?: Options) {
  return useQuery({
    queryKey: telemetryKeys.logFields(params),
    queryFn: () => telemetryApi.logFields(params),
    ...common(params, options),
    // Field names are stable within a window; polling them is wasted work.
    refetchInterval: false as const,
    staleTime: 60_000,
  });
}

export function useLogFieldValues(key: string, params: LogQueryParams, options?: Options) {
  return useQuery({
    queryKey: telemetryKeys.logFieldValues(key, params),
    queryFn: () => telemetryApi.logFieldValues(key, params),
    enabled: (options?.enabled ?? true) && Boolean(key),
    refetchInterval: false as const,
    staleTime: 60_000,
  });
}

export function useAuditTrail(params: LogQueryParams, options?: Options) {
  return useQuery({
    queryKey: telemetryKeys.audit(params),
    queryFn: () => telemetryApi.audit(params),
    ...common(params, options),
  });
}

export function useTraces(
  params: BaseParams & {
    services?: string[];
    spanName?: string;
    minDurationMs?: number;
    errorsOnly?: boolean;
    limit?: number;
    offset?: number;
  },
  options?: Options
) {
  return useQuery({
    queryKey: telemetryKeys.traces(params),
    queryFn: () => telemetryApi.traces(params),
    ...common(params, options),
  });
}

export function useTrace(traceId: string | undefined) {
  return useQuery({
    queryKey: telemetryKeys.trace(traceId ?? ''),
    queryFn: () => telemetryApi.trace(traceId as string),
    enabled: Boolean(traceId),
    // A trace is immutable once written, so it never needs refetching.
    staleTime: Infinity,
  });
}

export function useRequestTimeseries(
  params: BaseParams & { services?: string[]; buckets?: number },
  options?: Options
) {
  return useQuery({
    queryKey: telemetryKeys.requests(params),
    queryFn: () => telemetryApi.requestTimeseries(params),
    ...common(params, options),
  });
}

export function useTopEndpoints(
  params: BaseParams & { services?: string[]; limit?: number },
  options?: Options
) {
  return useQuery({
    queryKey: telemetryKeys.endpoints(params),
    queryFn: () => telemetryApi.endpoints(params),
    ...common(params, options),
  });
}

export function useMetricCatalogue(params: BaseParams, options?: Options) {
  return useQuery({
    queryKey: telemetryKeys.metrics(params),
    queryFn: () => telemetryApi.metrics(params),
    ...common(params, options),
    refetchInterval: false as const,
    staleTime: 60_000,
  });
}

export function useMetricQuery(
  params: BaseParams & {
    name: string;
    type?: string;
    services?: string[];
    groupBy?: string;
    buckets?: number;
  },
  options?: Options
) {
  return useQuery({
    queryKey: telemetryKeys.metricQuery(params),
    queryFn: () => telemetryApi.metricQuery(params),
    ...common(params, options),
    enabled: (options?.enabled ?? true) && Boolean(params.name),
  });
}

export function useContainerUsage(params: BaseParams, options?: Options) {
  return useQuery({
    queryKey: telemetryKeys.containers(params),
    queryFn: () => telemetryApi.containers(params),
    ...common(params, options),
  });
}

export function useTelemetryStorage() {
  return useQuery({
    queryKey: telemetryKeys.storage(),
    queryFn: () => telemetryApi.storage(),
    staleTime: 60_000,
  });
}

export type { TimeRangeValue };
