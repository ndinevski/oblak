/**
 * Trace explorer.
 *
 * Lists root spans so each row is one end-to-end request, with filters for the
 * two questions that actually get asked: what failed, and what was slow.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AutoRefreshToggle,
  EmptyState,
  FilterBar,
  ServicePicker,
  TelemetryUnavailable,
  TimeRangePicker,
} from '@/components/observability/controls';
import {
  useTelemetryHealth,
  useTelemetryServices,
  useTraces,
  telemetryKeys,
} from '@/hooks/useTelemetry';
import {
  formatCount,
  formatDuration,
  type TimeRangeValue,
} from '@/lib/api/telemetry';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

export default function TracesPage() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<TimeRangeValue>('1h');
  const [service, setService] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [minDuration, setMinDuration] = useState('');
  const [page, setPage] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const filters = useMemo(
    () => ({
      range,
      services: service ? [service] : undefined,
      errorsOnly: errorsOnly || undefined,
      minDurationMs: minDuration ? Number(minDuration) : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [range, service, errorsOnly, minDuration, page]
  );

  const health = useTelemetryHealth();
  const services = useTelemetryServices({ range });
  const traces = useTraces(filters, { autoRefresh });

  if (health.data && (!health.data.configured || !health.data.reachable)) {
    return (
      <div className="space-y-6">
        <Heading />
        <TelemetryUnavailable configured={health.data.configured} error={health.data.error} />
      </div>
    );
  }

  const rows = traces.data?.rows ?? [];
  const total = traces.data?.total ?? 0;

  return (
    <div className="space-y-6">
      <Heading />

      <FilterBar>
        <TimeRangePicker value={range} onChange={(v) => { setRange(v); setPage(0); }} />
        <ServicePicker
          services={(services.data ?? []).map((s) => s.service)}
          value={service}
          onChange={(v) => { setService(v); setPage(0); }}
        />
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={minDuration}
            onChange={(e) => { setMinDuration(e.target.value); setPage(0); }}
            placeholder="Min ms"
            className="h-9 w-[110px]"
            aria-label="Minimum duration in milliseconds"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="errors-only"
            checked={errorsOnly}
            onCheckedChange={(v) => { setErrorsOnly(v); setPage(0); }}
          />
          <Label htmlFor="errors-only" className="text-sm">
            Errors only
          </Label>
        </div>
        <AutoRefreshToggle
          enabled={autoRefresh}
          onToggle={setAutoRefresh}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: telemetryKeys.all })}
          isFetching={traces.isFetching}
        />
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 && !traces.isLoading ? (
            <EmptyState
              message="No traces match these filters"
              hint="Traffic to an instrumented service will populate this list"
            />
          ) : (
            <div className={cn('overflow-x-auto', traces.isFetching && 'opacity-60')}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Started</th>
                    <th className="px-3 py-2 font-medium">Service</th>
                    <th className="px-3 py-2 font-medium">Operation</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((trace) => {
                    const isError = trace.statusCode === 'Error';
                    return (
                      <tr
                        key={trace.traceId}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                          <Link to={`/observability/traces/${trace.traceId}`}>
                            {new Date(trace.timestamp).toLocaleTimeString()}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            to={`/observability/traces/${trace.traceId}`}
                            className="hover:underline"
                          >
                            {trace.service}
                          </Link>
                        </td>
                        <td className="max-w-[420px] px-3 py-2">
                          <Link
                            to={`/observability/traces/${trace.traceId}`}
                            className="block truncate font-mono text-xs hover:underline"
                          >
                            {trace.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          {/* Icon plus text: the state never rests on colour. */}
                          <Badge
                            variant="outline"
                            className={cn(
                              'gap-1 text-[10px]',
                              isError
                                ? 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
                                : 'border-border bg-muted text-muted-foreground'
                            )}
                          >
                            {isError ? (
                              <AlertCircle className="h-3 w-3" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            {trace.httpStatus || (isError ? 'Error' : 'OK')}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatDuration(trace.durationMs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
    </div>
  );
}

function Heading() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Observability Traces</h1>
      <p className="text-muted-foreground">
        End-to-end requests across the Oblak services
      </p>
    </div>
  );
}
