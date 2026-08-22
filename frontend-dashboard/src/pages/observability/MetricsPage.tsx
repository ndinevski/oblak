/**
 * Metric explorer.
 *
 * Browses every metric in the store, from application RED metrics through to
 * host and container resource usage, and charts one at a time.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartCard,
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
  useMetricCatalogue,
  useMetricQuery,
  useTelemetryHealth,
  useTelemetryStorage,
  telemetryKeys,
} from '@/hooks/useTelemetry';
import {
  formatBytes,
  formatCount,
  type MetricInfo,
  type TimeRangeValue,
} from '@/lib/api/telemetry';
import { cn } from '@/lib/utils';

export default function MetricsPage() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<TimeRangeValue>('1h');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<MetricInfo | null>(null);
  const [groupBy, setGroupBy] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const health = useTelemetryHealth();
  const catalogue = useMetricCatalogue({ range });
  const storage = useTelemetryStorage();

  // Metric names repeat once per reporting service, so the catalogue is
  // collapsed to one row per name.
  const metrics = useMemo(() => {
    const byName = new Map<string, MetricInfo>();
    for (const metric of catalogue.data ?? []) {
      if (!byName.has(metric.name)) byName.set(metric.name, metric);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogue.data]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return metrics;
    return metrics.filter((m) => m.name.toLowerCase().includes(needle));
  }, [metrics, filter]);

  // Land on something useful rather than an empty chart pane.
  useEffect(() => {
    if (!selected && metrics.length) {
      const preferred =
        metrics.find((m) => m.name === 'http.server.request.duration') ??
        metrics.find((m) => m.name.startsWith('http.server')) ??
        metrics[0];
      setSelected(preferred);
    }
  }, [metrics, selected]);

  const series = useMetricQuery(
    {
      range,
      name: selected?.name ?? '',
      type: selected?.type,
      groupBy: groupBy || undefined,
      buckets: 60,
    },
    { autoRefresh, enabled: Boolean(selected) }
  );

  const valueKey = selected?.type === 'histogram' ? 'avg' : 'value';
  const chart = useMemo(
    () => pivotSeries(series.data ?? [], 'bucket', 'series', valueKey),
    [series.data, valueKey]
  );
  const seriesDefs = useSeriesDefs(chart.seriesNames);

  if (health.data && (!health.data.configured || !health.data.reachable)) {
    return (
      <div className="space-y-4">
        <Heading />
        <TelemetryUnavailable configured={health.data.configured} error={health.data.error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Heading />

      <FilterBar>
        <TimeRangePicker value={range} onChange={setRange} />
        <Select value={groupBy || '__none__'} onValueChange={(v) => setGroupBy(v === '__none__' ? '' : v)}>
          <SelectTrigger className="h-9 w-[200px]" aria-label="Break down by">
            <SelectValue placeholder="Break down by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">By service</SelectItem>
            <SelectItem value="http.route">By route</SelectItem>
            <SelectItem value="http.request.method">By method</SelectItem>
            <SelectItem value="http.response.status_class">By status class</SelectItem>
            <SelectItem value="container.name">By container</SelectItem>
            <SelectItem value="postgresql.database.name">By database</SelectItem>
            <SelectItem value="postgresql.table.name">By table</SelectItem>
            <SelectItem value="system.device">By device</SelectItem>
            <SelectItem value="cpu">By CPU core</SelectItem>
          </SelectContent>
        </Select>
        <AutoRefreshToggle
          enabled={autoRefresh}
          onToggle={setAutoRefresh}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: telemetryKeys.all })}
          isFetching={series.isFetching}
        />
      </FilterBar>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Metrics
              <span className="ml-2 font-normal text-muted-foreground">{metrics.length}</span>
            </CardTitle>
            <div className="relative pt-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter metrics..."
                className="h-8 pl-8 text-xs"
                aria-label="Filter metrics"
              />
            </div>
          </CardHeader>
          <CardContent className="p-2">
            <div className="max-h-[520px] space-y-0.5 overflow-y-auto">
              {visible.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No metrics match
                </p>
              ) : (
                visible.map((metric) => (
                  <button
                    key={metric.name}
                    type="button"
                    onClick={() => setSelected(metric)}
                    className={cn(
                      'w-full rounded px-2 py-1.5 text-left hover:bg-muted',
                      selected?.name === metric.name && 'bg-muted'
                    )}
                  >
                    <span className="block truncate font-mono text-[11px]">{metric.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {metric.type}
                      {metric.unit && ` · ${metric.unit}`}
                    </span>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {selected ? (
            <ChartCard
              title={selected.name}
              description={selected.description || `${selected.type} metric`}
              actions={
                <Badge variant="outline" className="text-[10px]">
                  {selected.unit || selected.type}
                </Badge>
              }
              isLoading={series.isFetching}
              isEmpty={!series.isLoading && chart.data.length === 0}
              emptyMessage="This metric reported no points in the selected window"
              tableColumns={[
                { key: 'bucket', label: 'Time' },
                ...chart.seriesNames.map((n) => ({ key: n, label: n })),
              ]}
              tableRows={chart.data}
            >
              <TimeSeriesChart
                data={chart.data}
                series={seriesDefs}
                xKey="bucket"
                height={300}
                valueFormatter={(v) => formatMetricValue(v, selected.unit)}
                xTickFormatter={shortTime}
                labelFormatter={fullTime}
              />
            </ChartCard>
          ) : (
            <Card>
              <CardContent>
                <EmptyState message="Select a metric to chart it" />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Telemetry storage</CardTitle>
              <p className="text-xs text-muted-foreground">
                Rows and disk per signal, after compression
              </p>
            </CardHeader>
            <CardContent>
              {storage.data?.length ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">Table</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Rows</th>
                      <th className="py-1.5 text-right font-medium">On disk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storage.data.map((row) => (
                      <tr key={row.table} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-3 font-mono">{row.table}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {formatCount(Number(row.rows))}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatBytes(Number(row.diskBytes))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState message="No storage statistics available" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Heading() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Metrics</h1>
      <p className="text-sm text-muted-foreground">
        Application, host and container metrics from every Oblak service
      </p>
    </div>
  );
}

/** Formats an axis value according to the metric's declared unit. */
function formatMetricValue(value: number, unit: string): string {
  if (unit === 'By') return formatBytes(value);
  if (unit === 'ms') return `${value < 10 ? value.toFixed(1) : value.toFixed(0)}ms`;
  if (unit === 's') return `${value.toFixed(2)}s`;
  if (unit === '1' || unit === '%') return `${(value * (unit === '1' ? 100 : 1)).toFixed(1)}%`;
  if (Math.abs(value) >= 1000) return formatCount(value);
  return String(Math.round(value * 100) / 100);
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
