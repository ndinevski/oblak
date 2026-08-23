/**
 * Observability overview.
 *
 * The landing page for Oblak's telemetry: one view answering "is anything on
 * fire, and where", across every service at once.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, AlertCircle, Boxes, Timer } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChartCard,
  StatTile,
  TimeSeriesChart,
  pivotSeries,
  useSeriesDefs,
} from '@/components/observability/charts';
import {
  AutoRefreshToggle,
  EmptyState,
  FilterBar,
  TelemetryUnavailable,
  TimeRangePicker,
} from '@/components/observability/controls';
import {
  useContainerUsage,
  useRequestTimeseries,
  useServiceOverview,
  useTelemetryHealth,
  useTelemetrySummary,
  useTopEndpoints,
  telemetryKeys,
} from '@/hooks/useTelemetry';
import {
  formatCount,
  formatDuration,
  type TimeRangeValue,
} from '@/lib/api/telemetry';

export default function OverviewPage() {
  const [range, setRange] = useState<TimeRangeValue>('1h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const queryClient = useQueryClient();

  const params = { range };
  const opts = { autoRefresh };

  const health = useTelemetryHealth();
  const summary = useTelemetrySummary(params, opts);
  const services = useServiceOverview(params, opts);
  const requests = useRequestTimeseries({ ...params, buckets: 48 }, opts);
  const endpoints = useTopEndpoints({ ...params, limit: 8 }, opts);
  const containers = useContainerUsage(params, opts);

  const requestChart = useMemo(
    () => pivotSeries(requests.data ?? [], 'bucket', 'service', 'requests'),
    [requests.data]
  );
  const requestSeries = useSeriesDefs(requestChart.seriesNames);

  const latencyChart = useMemo(
    () => pivotSeries(requests.data ?? [], 'bucket', 'service', 'p95Ms'),
    [requests.data]
  );
  const latencySeries = useSeriesDefs(latencyChart.seriesNames);

  if (health.data && (!health.data.configured || !health.data.reachable)) {
    return (
      <div className="space-y-6">
        <PageHeading />
        <TelemetryUnavailable
          configured={health.data.configured}
          error={health.data.error}
        />
      </div>
    );
  }

  const s = summary.data;
  const errorRate = s?.requests.errorRate ?? 0;

  return (
    <div className="space-y-6">
      <PageHeading />

      {/* Filters scope everything below them. */}
      <FilterBar>
        <TimeRangePicker value={range} onChange={setRange} />
        <AutoRefreshToggle
          enabled={autoRefresh}
          onToggle={setAutoRefresh}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: telemetryKeys.all })}
          isFetching={summary.isFetching}
        />
      </FilterBar>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Requests"
          value={formatCount(s?.requests.total)}
          hint="server spans"
          icon={<Activity className="h-4 w-4" />}
        />
        <StatTile
          label="Error rate"
          value={`${errorRate.toFixed(2)}%`}
          // Status tone is paired with the label, never carrying meaning alone.
          tone={errorRate >= 5 ? 'critical' : errorRate >= 1 ? 'warning' : 'good'}
          hint={`${formatCount(s?.requests.errors)} failed`}
          icon={<AlertCircle className="h-4 w-4" />}
        />
        <StatTile
          label="p95 latency"
          value={formatDuration(s?.requests.p95Ms)}
          hint="across all services"
          icon={<Timer className="h-4 w-4" />}
        />
        <StatTile
          label="Services reporting"
          value={String(s?.services ?? 0)}
          hint={`${formatCount(s?.logs.total)} log records`}
          icon={<Boxes className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Request rate by service"
          description="Server spans per bucket"
          isLoading={requests.isFetching}
          isEmpty={!requests.isLoading && requestChart.data.length === 0}
          tableColumns={[
            { key: 'bucket', label: 'Time' },
            ...requestChart.seriesNames.map((n) => ({ key: n, label: n })),
          ]}
          tableRows={requestChart.data}
        >
          <TimeSeriesChart
            data={requestChart.data}
            series={requestSeries}
            xKey="bucket"
            area
            valueFormatter={formatCount}
            xTickFormatter={shortTime}
            labelFormatter={fullTime}
          />
        </ChartCard>

        <ChartCard
          title="p95 latency by service"
          description="95th percentile server span duration"
          isLoading={requests.isFetching}
          isEmpty={!requests.isLoading && latencyChart.data.length === 0}
          tableColumns={[
            { key: 'bucket', label: 'Time' },
            ...latencyChart.seriesNames.map((n) => ({ key: n, label: `${n} (ms)` })),
          ]}
          tableRows={latencyChart.data}
        >
          <TimeSeriesChart
            data={latencyChart.data}
            series={latencySeries}
            xKey="bucket"
            valueFormatter={formatDuration}
            xTickFormatter={shortTime}
            labelFormatter={fullTime}
          />
        </ChartCard>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Services</CardTitle>
        </CardHeader>
        <CardContent>
          {services.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Service</th>
                    <th className="py-2 pr-4 text-right font-medium">Requests</th>
                    <th className="py-2 pr-4 text-right font-medium">Errors</th>
                    <th className="py-2 pr-4 text-right font-medium">Error rate</th>
                    <th className="py-2 pr-4 text-right font-medium">p50</th>
                    <th className="py-2 pr-4 text-right font-medium">p95</th>
                    <th className="py-2 pr-4 text-right font-medium">p99</th>
                  </tr>
                </thead>
                <tbody>
                  {services.data.map((svc) => (
                    <tr key={svc.service} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4">
                        <Link
                          to={`/observability/logs?service=${encodeURIComponent(svc.service)}`}
                          className="font-medium hover:underline"
                        >
                          {svc.service}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatCount(svc.requests)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatCount(svc.errors)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {/* Icon + label pairing, so the state never rests on
                            colour alone. */}
                        <Badge
                          variant="outline"
                          className={
                            svc.errorRate >= 5
                              ? 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
                              : svc.errorRate >= 1
                                ? 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                : 'border-border bg-muted text-muted-foreground'
                          }
                        >
                          {svc.errorRate.toFixed(2)}%
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {formatDuration(svc.p50Ms)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatDuration(svc.p95Ms)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {formatDuration(svc.p99Ms)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              message="No services have reported traces in this window"
              hint="Traffic to an instrumented service will populate this table"
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Slowest endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            {endpoints.data?.length ? (
              <div className="space-y-1.5">
                {endpoints.data.map((ep) => (
                  <div
                    key={`${ep.service}-${ep.endpoint}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ep.endpoint}</p>
                      <p className="text-xs text-muted-foreground">
                        {ep.service} · {formatCount(ep.requests)} calls
                        {ep.errors > 0 && ` · ${formatCount(ep.errors)} errors`}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-sm font-medium">
                      {formatDuration(ep.p95Ms)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No endpoint data in this window" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Container resources</CardTitle>
            <p className="text-xs text-muted-foreground">
              Includes services Oblak does not instrument directly
            </p>
          </CardHeader>
          <CardContent>
            {containers.data?.length ? (
              <div className="max-h-[260px] space-y-1.5 overflow-y-auto">
                {containers.data.map((c) => (
                  <div key={c.container} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-3">{c.container}</span>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {c.memoryMb.toFixed(0)} MB
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No container metrics in this window" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Observability</h1>
      <p className="text-muted-foreground">
        Logs, metrics and traces from every Oblak service
      </p>
    </div>
  );
}

function shortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fullTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
