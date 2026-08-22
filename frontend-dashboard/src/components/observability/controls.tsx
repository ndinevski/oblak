/**
 * Filter controls for the observability views.
 *
 * These are ordinary form controls, not chart marks. They sit in a single row
 * above the content they scope, date range first, and every chart, stat and
 * table below re-renders against the same slice so the numbers always agree.
 */

import { AlertTriangle, Database, Pause, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TIME_RANGES, type TimeRangeValue } from '@/lib/api/telemetry';

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  );
}

/** The control every reader reaches for first, so it leads the row. */
export function TimeRangePicker({
  value,
  onChange,
}: {
  value: TimeRangeValue;
  onChange: (value: TimeRangeValue) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TimeRangeValue)}>
      <SelectTrigger className="h-9 w-[170px]" aria-label="Time range">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIME_RANGES.map((range) => (
          <SelectItem key={range.value} value={range.value}>
            {range.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ServicePicker({
  services,
  value,
  onChange,
  allLabel = 'All services',
}: {
  services: string[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
}) {
  return (
    <Select value={value || '__all__'} onValueChange={(v) => onChange(v === '__all__' ? '' : v)}>
      <SelectTrigger className="h-9 w-[180px]" aria-label="Service">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{allLabel}</SelectItem>
        {services.map((service) => (
          <SelectItem key={service} value={service}>
            {service}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Pauses background polling.
 *
 * Reading a log line or a trace while the list refreshes underneath is the
 * fastest way to lose your place, so the reader can freeze the view.
 */
export function AutoRefreshToggle({
  enabled,
  onToggle,
  onRefresh,
  isFetching,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onRefresh: () => void;
  isFetching?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => onToggle(!enabled)}
        aria-label={enabled ? 'Pause auto refresh' : 'Resume auto refresh'}
        title={enabled ? 'Pause auto refresh' : 'Resume auto refresh'}
      >
        {enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        <span className="ml-1.5 hidden sm:inline">{enabled ? 'Live' : 'Paused'}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0"
        onClick={onRefresh}
        aria-label="Refresh now"
        title="Refresh now"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Degraded states
// ---------------------------------------------------------------------------

/**
 * Shown when the telemetry store is missing or unreachable.
 *
 * The dashboard must stay usable without observability, so every telemetry
 * page renders this instead of an error boundary.
 */
export function TelemetryUnavailable({
  configured,
  error,
}: {
  configured: boolean;
  error?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        {configured ? (
          <AlertTriangle className="h-8 w-8 text-amber-500" />
        ) : (
          <Database className="h-8 w-8 text-muted-foreground" />
        )}
        <div className="space-y-1">
          <p className="font-medium">
            {configured ? 'Telemetry store unreachable' : 'Observability is not configured'}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {configured ? (
              <>
                The dashboard cannot reach ClickHouse. Check that the observability stack
                is running: <code className="text-xs">make up-observability</code>
              </>
            ) : (
              <>
                Start the observability stack and set <code className="text-xs">CLICKHOUSE_URL</code>{' '}
                in the backend environment to enable logs, metrics and traces.
              </>
            )}
          </p>
          {error && (
            <p className="max-w-md break-words pt-2 text-xs text-muted-foreground/80">{error}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
