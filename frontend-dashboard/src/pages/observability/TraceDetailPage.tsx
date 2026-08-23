/**
 * Trace waterfall.
 *
 * Shows every span in one trace on a shared timeline, so the reader can see
 * where the time actually went and which service caused a failure.
 */

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ScrollText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/observability/charts';
import { EmptyState } from '@/components/observability/controls';
import { useTrace } from '@/hooks/useTelemetry';
import { formatDuration, seriesColor, type TraceSpan } from '@/lib/api/telemetry';
import { cn } from '@/lib/utils';

interface LaidOutSpan {
  span: TraceSpan;
  depth: number;
  /** Percentage offset and width against the whole-trace timeline. */
  offsetPct: number;
  widthPct: number;
}

export default function TraceDetailPage() {
  const { traceId } = useParams<{ traceId: string }>();
  const { data, isLoading, error } = useTrace(traceId);
  const [selected, setSelected] = useState<string | null>(null);

  const spans = data?.spans ?? [];

  const { laidOut, totalMs, startMs, services, errorCount } = useMemo(
    () => layout(spans),
    [spans]
  );

  const selectedSpan = spans.find((s) => s.spanId === selected) ?? null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !spans.length) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card>
          <CardContent>
            <EmptyState
              message="Trace not found"
              hint="It may have fallen outside the telemetry retention window"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const root = laidOut[0]?.span;

  return (
    <div className="space-y-6">
      <BackLink />

      <div>
        <h1 className="text-2xl font-bold">{root?.name}</h1>
        <p className="font-mono text-xs text-muted-foreground">{traceId}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total duration" value={formatDuration(totalMs)} />
        <StatTile label="Spans" value={String(spans.length)} />
        <StatTile label="Services" value={String(services.length)} />
        <StatTile
          label="Errors"
          value={String(errorCount)}
          tone={errorCount > 0 ? 'critical' : 'good'}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Waterfall</CardTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
            {services.map((service) => (
              <div key={service} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: seriesColor(service, services) }}
                />
                <span className="text-xs text-muted-foreground">{service}</span>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-0.5">
            {laidOut.map(({ span, depth, offsetPct, widthPct }) => {
              const isError = span.statusCode === 'Error';
              const isSelected = selected === span.spanId;
              return (
                <button
                  key={span.spanId}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : span.spanId)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-muted/50',
                    isSelected && 'bg-muted'
                  )}
                  aria-expanded={isSelected}
                >
                  <span
                    className="min-w-0 shrink-0 truncate text-xs"
                    style={{ paddingLeft: `${depth * 12}px`, width: '38%' }}
                    title={`${span.service} · ${span.name}`}
                  >
                    {isError && (
                      <AlertCircle className="mr-1 inline h-3 w-3 text-red-500" aria-hidden />
                    )}
                    <span className="font-mono">{span.name}</span>
                  </span>

                  {/* The bar's own track is the timeline; offset carries when
                      the span started relative to the trace. */}
                  <span className="relative h-4 flex-1 overflow-hidden rounded-sm bg-muted/40">
                    <span
                      className="absolute inset-y-0 rounded-sm"
                      style={{
                        left: `${offsetPct}%`,
                        width: `${Math.max(widthPct, 0.4)}%`,
                        backgroundColor: isError
                          ? 'var(--status-critical)'
                          : seriesColor(span.service, services),
                      }}
                    />
                  </span>

                  <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatDuration(span.durationMs)}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedSpan && <SpanDetail span={selectedSpan} startMs={startMs} />}

      <div>
        <Link to={`/observability/logs?traceId=${traceId}`}>
          <Button variant="outline" size="sm">
            <ScrollText className="mr-2 h-3.5 w-3.5" />
            View logs for this trace
          </Button>
        </Link>
      </div>
    </div>
  );
}

function SpanDetail({ span, startMs }: { span: TraceSpan; startMs: number }) {
  const attributes = Object.entries(span.attributes ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{span.name}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {span.service} · {span.kind} · starts +
          {formatDuration(span.startMs - startMs)} · {formatDuration(span.durationMs)}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {span.statusCode === 'Error' && (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              {span.statusMessage || 'Span reported an error'}
            </p>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Span id</p>
          <p className="font-mono text-xs">{span.spanId}</p>
        </div>

        {attributes.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Attributes</p>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {attributes.map(([key, value]) => (
                <div key={key} className="flex items-baseline gap-2">
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {key}
                  </span>
                  <span className="truncate font-mono text-[11px]" title={value}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {span.eventNames?.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Events</p>
            <div className="space-y-1">
              {span.eventNames.map((name, i) => (
                <div key={i} className="flex items-baseline gap-2 text-[11px]">
                  <Badge variant="outline" className="text-[10px]">
                    {name}
                  </Badge>
                  <span className="font-mono text-muted-foreground">
                    {span.eventTimestamps?.[i]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BackLink() {
  return (
    <Link
      to="/observability/traces"
      className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
      Back to traces
    </Link>
  );
}

/**
 * Arranges spans into parent/child order with a depth for indentation, and
 * computes each span's position on the trace-wide timeline.
 *
 * Orphans (a parent span missing because it was sampled out or is still in
 * flight) are treated as roots rather than dropped, so the waterfall never
 * silently hides work.
 */
function layout(spans: TraceSpan[]): {
  laidOut: LaidOutSpan[];
  totalMs: number;
  startMs: number;
  services: string[];
  errorCount: number;
} {
  if (!spans.length) {
    return { laidOut: [], totalMs: 0, startMs: 0, services: [], errorCount: 0 };
  }

  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const children = new Map<string, TraceSpan[]>();
  const roots: TraceSpan[] = [];

  for (const span of spans) {
    const hasParent = span.parentSpanId && byId.has(span.parentSpanId);
    if (hasParent) {
      const list = children.get(span.parentSpanId) ?? [];
      list.push(span);
      children.set(span.parentSpanId, list);
    } else {
      roots.push(span);
    }
  }

  const startMs = Math.min(...spans.map((s) => Number(s.startMs)));
  const endMs = Math.max(...spans.map((s) => Number(s.startMs) + Number(s.durationMs)));
  const totalMs = Math.max(endMs - startMs, 0.001);

  const laidOut: LaidOutSpan[] = [];

  const walk = (span: TraceSpan, depth: number) => {
    const spanStart = Number(span.startMs);
    laidOut.push({
      span,
      depth,
      offsetPct: ((spanStart - startMs) / totalMs) * 100,
      widthPct: (Number(span.durationMs) / totalMs) * 100,
    });
    const kids = (children.get(span.spanId) ?? []).sort(
      (a, b) => Number(a.startMs) - Number(b.startMs)
    );
    for (const kid of kids) walk(kid, depth + 1);
  };

  for (const root of roots.sort((a, b) => Number(a.startMs) - Number(b.startMs))) {
    walk(root, 0);
  }

  return {
    laidOut,
    totalMs,
    startMs,
    services: [...new Set(spans.map((s) => s.service))].sort(),
    errorCount: spans.filter((s) => s.statusCode === 'Error').length,
  };
}
