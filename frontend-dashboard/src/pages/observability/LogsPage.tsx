/**
 * Log explorer.
 *
 * Search, filter and live-tail structured logs from every Oblak service in one
 * place. Rows expand to show the full attribute set, and a record carrying a
 * trace id links straight to its trace.
 */

import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, GitBranch, Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChartCard, StackedBarChart } from '@/components/observability/charts';
import {
  AutoRefreshToggle,
  EmptyState,
  FilterBar,
  ServicePicker,
  TelemetryUnavailable,
  TimeRangePicker,
} from '@/components/observability/controls';
import {
  useLogFields,
  useLogHistogram,
  useLogs,
  useTelemetryHealth,
  useTelemetryServices,
  telemetryKeys,
} from '@/hooks/useTelemetry';
import {
  SEVERITY_LEVELS,
  formatCount,
  formatTimestamp,
  severityBadgeClass,
  type LogRecord,
  type TimeRangeValue,
} from '@/lib/api/telemetry';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 100;

/**
 * Severity colours come from the reserved status palette, not the categorical
 * series slots, so a severity can never be mistaken for a service.
 */
const SEVERITY_SERIES = [
  { key: 'DEBUG', label: 'Debug', color: 'var(--chart-axis)' },
  { key: 'INFO', label: 'Info', color: 'var(--chart-1)' },
  { key: 'WARN', label: 'Warn', color: 'var(--status-warning)' },
  { key: 'ERROR', label: 'Error', color: 'var(--status-critical)' },
];

export default function LogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [range, setRange] = useState<TimeRangeValue>('1h');
  const [service, setService] = useState(searchParams.get('service') ?? '');
  const [minSeverity, setMinSeverity] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const traceId = searchParams.get('traceId') ?? undefined;

  const filters = useMemo(
    () => ({
      range,
      services: service ? [service] : undefined,
      minSeverity: minSeverity || undefined,
      search: search || undefined,
      traceId,
      attributes,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [range, service, minSeverity, search, traceId, attributes, page]
  );

  // The histogram spans the same slice but is not paginated.
  const histogramFilters = useMemo(
    () => ({ ...filters, limit: undefined, offset: undefined, buckets: 60 }),
    [filters]
  );

  const health = useTelemetryHealth();
  const services = useTelemetryServices({ range });
  const logs = useLogs(filters, { autoRefresh });
  const histogram = useLogHistogram(histogramFilters, { autoRefresh });
  const fields = useLogFields(histogramFilters);

  const histogramData = useMemo(() => {
    const buckets = new Map<string, Record<string, string | number>>();
    for (const row of histogram.data ?? []) {
      const key = row.bucket;
      if (!buckets.has(key)) {
        buckets.set(key, {
          bucket: key,
          DEBUG: 0,
          INFO: 0,
          WARN: 0,
          ERROR: 0,
        });
      }
      const entry = buckets.get(key)!;
      const severity = normaliseSeverity(row.severityText);
      entry[severity] = (Number(entry[severity]) || 0) + row.count;
    }
    return [...buckets.values()].sort((a, b) =>
      String(a.bucket).localeCompare(String(b.bucket))
    );
  }, [histogram.data]);

  const applySearch = useCallback(() => {
    setSearch(searchInput);
    setPage(0);
  }, [searchInput]);

  const addAttributeFilter = useCallback(
    (key: string, value: string) => {
      setAttributes((prev) => ({ ...prev, [key]: value }));
      setPage(0);
    },
    []
  );

  const removeAttributeFilter = useCallback((key: string) => {
    setAttributes((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setPage(0);
  }, []);

  const clearTraceFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('traceId');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  if (health.data && (!health.data.configured || !health.data.reachable)) {
    return (
      <div className="space-y-6">
        <Heading />
        <TelemetryUnavailable configured={health.data.configured} error={health.data.error} />
      </div>
    );
  }

  const rows = logs.data?.rows ?? [];
  const total = logs.data?.total ?? 0;
  const serviceNames = (services.data ?? []).map((s) => s.service);

  return (
    <div className="space-y-6">
      <Heading />

      <FilterBar>
        <TimeRangePicker value={range} onChange={(v) => { setRange(v); setPage(0); }} />
        <ServicePicker
          services={serviceNames}
          value={service}
          onChange={(v) => { setService(v); setPage(0); }}
        />
        <Select
          value={String(minSeverity)}
          onValueChange={(v) => { setMinSeverity(Number(v)); setPage(0); }}
        >
          <SelectTrigger className="h-9 w-[170px]" aria-label="Minimum severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_LEVELS.map((level) => (
              <SelectItem key={level.value} value={String(level.value)}>
                {level.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder="Search log messages..."
            className="h-9 pl-8"
            aria-label="Search log messages"
          />
        </div>
        <Button variant="secondary" size="sm" className="h-9" onClick={applySearch}>
          Search
        </Button>

        <AutoRefreshToggle
          enabled={autoRefresh}
          onToggle={setAutoRefresh}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: telemetryKeys.all })}
          isFetching={logs.isFetching}
        />
      </FilterBar>

      {/* Active filters are shown as removable chips so the reader always
          knows what is scoping the result set. */}
      {(Object.keys(attributes).length > 0 || traceId || search) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {traceId && (
            <FilterChip
              label={`trace: ${traceId.slice(0, 16)}...`}
              onRemove={clearTraceFilter}
            />
          )}
          {search && (
            <FilterChip
              label={`search: ${search}`}
              onRemove={() => { setSearch(''); setSearchInput(''); }}
            />
          )}
          {Object.entries(attributes).map(([key, value]) => (
            <FilterChip
              key={key}
              label={`${key}: ${value}`}
              onRemove={() => removeAttributeFilter(key)}
            />
          ))}
        </div>
      )}

      <ChartCard
        title="Log volume"
        description={`${formatCount(total)} records match`}
        isLoading={histogram.isFetching}
        isEmpty={!histogram.isLoading && histogramData.length === 0}
        tableColumns={[
          { key: 'bucket', label: 'Time' },
          { key: 'DEBUG', label: 'Debug' },
          { key: 'INFO', label: 'Info' },
          { key: 'WARN', label: 'Warn' },
          { key: 'ERROR', label: 'Error' },
        ]}
        tableRows={histogramData}
      >
        <StackedBarChart
          data={histogramData}
          series={SEVERITY_SERIES}
          xKey="bucket"
          height={160}
          valueFormatter={formatCount}
          xTickFormatter={(v) => shortTime(v)}
          labelFormatter={(v) => fullTime(v)}
        />
      </ChartCard>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 && !logs.isLoading ? (
            <EmptyState
              message="No log records match these filters"
              hint="Try widening the time range or clearing a filter"
            />
          ) : (
            <div className={cn('divide-y divide-border', logs.isFetching && 'opacity-60')}>
              {rows.map((row) => (
                <LogRow
                  key={`${row.timestampMs}-${row.spanId}-${row.body.slice(0, 24)}`}
                  row={row}
                  isExpanded={expanded === rowKey(row)}
                  onToggle={() =>
                    setExpanded((prev) => (prev === rowKey(row) ? null : rowKey(row)))
                  }
                  onFilterAttribute={addAttributeFilter}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of{' '}
            {formatCount(total)}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {fields.data && fields.data.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Fields in this result set
            </p>
            <div className="flex flex-wrap gap-1.5">
              {fields.data.slice(0, 40).map((field) => (
                <Badge key={field.key} variant="outline" className="font-mono text-[11px]">
                  {field.key}
                  <span className="ml-1 text-muted-foreground">{formatCount(field.count)}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function LogRow({
  row,
  isExpanded,
  onToggle,
  onFilterAttribute,
}: {
  row: LogRecord;
  isExpanded: boolean;
  onToggle: () => void;
  onFilterAttribute: (key: string, value: string) => void;
}) {
  const attributeEntries = Object.entries(row.attributes ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/50"
        aria-expanded={isExpanded}
      >
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
          {formatTimestamp(row.timestampMs)}
        </span>
        {/* Severity is a badge with its own text, so it never relies on
            colour alone. */}
        <Badge
          variant="outline"
          className={cn('shrink-0 text-[10px]', severityBadgeClass(row.severityText))}
        >
          {row.severityText || 'INFO'}
        </Badge>
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {row.service}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{row.body}</span>
        {row.traceId && (
          <Link
            to={`/observability/traces/${row.traceId}`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="View trace"
            aria-label="View trace"
          >
            <GitBranch className="h-3.5 w-3.5" />
          </Link>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3 pl-9">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Message</p>
            <p className="whitespace-pre-wrap break-words font-mono text-xs">{row.body}</p>
          </div>

          {row.traceId && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Trace</p>
              <Link
                to={`/observability/traces/${row.traceId}`}
                className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                {row.traceId}
              </Link>
            </div>
          )}

          {attributeEntries.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Attributes</p>
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {attributeEntries.map(([key, value]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onFilterAttribute(key, value)}
                    className="group flex items-baseline gap-2 text-left"
                    title={`Filter by ${key} = ${value}`}
                  >
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground group-hover:text-foreground">
                      {key}
                    </span>
                    <span className="truncate font-mono text-[11px] group-hover:underline">
                      {value}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 font-mono text-[11px]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
        aria-label={`Remove filter ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

function Heading() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Observability Logs</h1>
      <p className="text-muted-foreground">
        Search structured logs across every Oblak service
      </p>
    </div>
  );
}

function rowKey(row: LogRecord): string {
  return `${row.timestampMs}-${row.spanId}-${row.body.slice(0, 24)}`;
}

/** Folds the long tail of severity names onto the four the chart plots. */
function normaliseSeverity(severity: string): string {
  const upper = (severity || 'INFO').toUpperCase();
  if (upper.startsWith('ERROR') || upper.startsWith('FATAL')) return 'ERROR';
  if (upper.startsWith('WARN')) return 'WARN';
  if (upper.startsWith('DEBUG') || upper.startsWith('TRACE')) return 'DEBUG';
  return 'INFO';
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
