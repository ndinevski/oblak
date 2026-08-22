/**
 * Chart primitives for the observability views.
 *
 * Conventions enforced here so individual pages cannot drift:
 *  - 2px lines, hairline solid gridlines, bars capped at 24px with a 4px
 *    rounded data-end and a 2px surface gap between stacked segments.
 *  - A legend whenever there are two or more series; identity is never
 *    colour-alone.
 *  - One crosshair tooltip listing every series at that X, with the value
 *    leading and the series name secondary.
 *  - A table view on every chart. Three light-mode categorical steps sit below
 *    3:1 against the card surface, so the table is the required relief rather
 *    than an optional extra.
 *  - Text always wears text tokens; only marks carry the series colour.
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Table2, LineChart as LineChartIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Shared chart chrome
// ---------------------------------------------------------------------------

const AXIS_STYLE = {
  fontSize: 11,
  fill: 'hsl(var(--muted-foreground))',
} as const;

/** Axis ticks are a column of numbers, so they get tabular figures. */
const TICK_PROPS = {
  tick: { ...AXIS_STYLE, style: { fontVariantNumeric: 'tabular-nums' } },
  tickLine: false,
  axisLine: false,
} as const;

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

// ---------------------------------------------------------------------------
// ChartCard - title, optional actions, and the mandatory table view
// ---------------------------------------------------------------------------

interface ChartCardProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Rows backing the chart, rendered when the reader switches to the table. */
  tableRows?: Array<Record<string, string | number>>;
  tableColumns?: Array<{ key: string; label: string }>;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
  children: ReactNode;
}

export function ChartCard({
  title,
  description,
  actions,
  tableRows,
  tableColumns,
  isLoading,
  isEmpty,
  emptyMessage = 'No data in this time range',
  className,
  children,
}: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  const canShowTable = Boolean(tableRows?.length && tableColumns?.length);

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {canShowTable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setShowTable((v) => !v)}
              aria-label={showTable ? 'Show chart' : 'Show data table'}
              title={showTable ? 'Show chart' : 'Show data table'}
            >
              {showTable ? (
                <LineChartIcon className="h-3.5 w-3.5" />
              ) : (
                <Table2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Refetching holds the previous render at reduced opacity rather than
            collapsing to a skeleton, so filters do not cause a layout jump. */}
        <div className={cn('transition-opacity', isLoading && 'opacity-60')}>
          {isEmpty ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : showTable && canShowTable ? (
            <DataTable rows={tableRows!} columns={tableColumns!} />
          ) : (
            children
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DataTable({
  rows,
  columns,
}: {
  rows: Array<Record<string, string | number>>;
  columns: Array<{ key: string; label: string }>;
}) {
  return (
    <div className="max-h-[260px] overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-left text-muted-foreground">
            {columns.map((col) => (
              <th key={col.key} className="py-1.5 pr-3 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="py-1.5 pr-3 tabular-nums text-foreground"
                >
                  {row[col.key] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip - one readout listing every series at the hovered X
// ---------------------------------------------------------------------------

interface TooltipPayloadItem {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  valueFormatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  series: SeriesDef[];
  valueFormatter?: (value: number) => string;
  labelFormatter?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;

  const byKey = new Map(series.map((s) => [s.key, s]));
  // Zero-valued series are dropped: on a wide dashboard they add rows of
  // noise without telling the reader anything.
  const rows = payload.filter((p) => p.value !== undefined && p.value !== null);
  if (!rows.length) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 shadow-md">
      <div className="mb-1.5 text-xs font-medium text-foreground">
        {labelFormatter ? labelFormatter(String(label)) : String(label)}
      </div>
      <div className="space-y-1">
        {rows.map((row, i) => {
          const def = byKey.get(String(row.dataKey));
          const value = typeof row.value === 'number' ? row.value : Number(row.value);
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              {/* A short stroke keys the series: at tooltip density a filled
                  box is data-weight ink doing a label's job. */}
              <span
                aria-hidden
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: def?.color ?? row.color }}
              />
              {/* Value leads, series name follows: the reader already knows
                  which series they are pointing at and wants the number. */}
              <span className="font-medium tabular-nums text-foreground">
                {valueFormatter ? valueFormatter(value) : value.toLocaleString()}
              </span>
              <span className="truncate text-muted-foreground">
                {def?.label ?? row.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

export function ChartLegend({
  series,
  variant = 'line',
}: {
  series: SeriesDef[];
  variant?: 'line' | 'area';
}) {
  // A single series needs no legend: the card title already names it.
  if (series.length < 2) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5">
          {/* The legend key mirrors the mark: a line for lines, a rect for
              areas and bars. */}
          <span
            aria-hidden
            className={cn(
              'shrink-0',
              variant === 'line' ? 'h-0.5 w-3.5 rounded-full' : 'h-2.5 w-2.5 rounded-sm'
            )}
            style={{ backgroundColor: s.color }}
          />
          <span className="text-xs text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimeSeriesChart
// ---------------------------------------------------------------------------

interface TimeSeriesChartProps {
  data: Array<Record<string, string | number>>;
  series: SeriesDef[];
  xKey: string;
  height?: number;
  /** Renders a 10%-opacity wash under each line. */
  area?: boolean;
  valueFormatter?: (value: number) => string;
  xTickFormatter?: (value: string) => string;
  labelFormatter?: (value: string) => string;
}

export function TimeSeriesChart({
  data,
  series,
  xKey,
  height = 220,
  area = false,
  valueFormatter,
  xTickFormatter,
  labelFormatter,
}: TimeSeriesChartProps) {
  const Chart = area ? AreaChart : LineChart;

  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {/* Hairline, solid, recessive - never dashed. */}
          <CartesianGrid
            stroke="var(--chart-grid)"
            strokeWidth={1}
            vertical={false}
          />
          <XAxis
            dataKey={xKey}
            {...TICK_PROPS}
            tickFormatter={xTickFormatter}
            minTickGap={40}
          />
          <YAxis
            {...TICK_PROPS}
            width={48}
            tickFormatter={(v) => (valueFormatter ? valueFormatter(Number(v)) : String(v))}
          />
          <Tooltip
            // The crosshair finds the X so the reader aims at a time, not at
            // a 2px line.
            cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
            content={
              <ChartTooltip
                series={series}
                valueFormatter={valueFormatter}
                labelFormatter={labelFormatter}
              />
            }
          />
          {series.map((s) =>
            area ? (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={s.color}
                fillOpacity={0.1}
                dot={false}
                activeDot={{
                  r: 4,
                  // The 2px surface ring keeps the marker legible where it
                  // crosses another line.
                  stroke: 'hsl(var(--card))',
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )
          )}
        </Chart>
      </ResponsiveContainer>
      <ChartLegend series={series} variant={area ? 'area' : 'line'} />
    </>
  );
}

// ---------------------------------------------------------------------------
// StackedBarChart
// ---------------------------------------------------------------------------

export function StackedBarChart({
  data,
  series,
  xKey,
  height = 180,
  valueFormatter,
  xTickFormatter,
  labelFormatter,
}: TimeSeriesChartProps) {
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
          <XAxis dataKey={xKey} {...TICK_PROPS} tickFormatter={xTickFormatter} minTickGap={40} />
          <YAxis
            {...TICK_PROPS}
            width={48}
            tickFormatter={(v) => (valueFormatter ? valueFormatter(Number(v)) : String(v))}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }}
            content={
              <ChartTooltip
                series={series}
                valueFormatter={valueFormatter}
                labelFormatter={labelFormatter}
              />
            }
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="stack"
              fill={s.color}
              maxBarSize={24}
              // Only the topmost segment gets the rounded data-end; interior
              // segments stay square so the stack reads as one bar.
              radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              // A stroke in the surface colour paints the 2px gap that
              // separates touching segments. It is the gap, not a border:
              // it carries no contrast of its own.
              stroke="hsl(var(--card))"
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend series={series} variant="area" />
    </>
  );
}

// ---------------------------------------------------------------------------
// StatTile
// ---------------------------------------------------------------------------

interface StatTileProps {
  label: string;
  value: string;
  /** Optional signed change against a named period. */
  delta?: { value: string; direction: 'up' | 'down'; goodDirection?: 'up' | 'down' };
  hint?: string;
  /** Status accent for the value, used for error-rate style tiles. */
  tone?: 'default' | 'good' | 'warning' | 'critical';
  icon?: ReactNode;
}

export function StatTile({ label, value, delta, hint, tone = 'default', icon }: StatTileProps) {
  const toneClass =
    tone === 'critical'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'good'
          ? 'text-green-600 dark:text-green-500'
          : 'text-foreground';

  const deltaIsGood = delta && delta.direction === (delta.goodDirection ?? 'up');

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          {/* Sentence case, no trailing colon. */}
          <p className="text-xs text-muted-foreground">{label}</p>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        {/* Proportional figures: tabular-nums makes a large standalone number
            look loose at display sizes. */}
        <p className={cn('mt-1.5 text-2xl font-semibold', toneClass)}>{value}</p>
        {(delta || hint) && (
          <div className="mt-1 flex items-center gap-2">
            {delta && (
              <span
                className={cn(
                  'text-xs font-medium',
                  deltaIsGood
                    ? 'text-green-600 dark:text-green-500'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {delta.direction === 'up' ? '↑' : '↓'} {delta.value}
              </span>
            )}
            {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pivot helper
// ---------------------------------------------------------------------------

/**
 * Turns long-form rows (one row per bucket per series) into the wide form
 * recharts expects (one row per bucket, one column per series).
 */
export function pivotSeries<T extends object>(
  rows: T[],
  bucketKey: keyof T,
  seriesKey: keyof T,
  valueKey: keyof T
): { data: Array<Record<string, string | number>>; seriesNames: string[] } {
  const buckets = new Map<string, Record<string, string | number>>();
  const names = new Set<string>();

  for (const row of rows) {
    const record = row as Record<string, unknown>;
    const bucket = String(record[bucketKey as string]);
    const name = String(record[seriesKey as string]);
    const value = Number(record[valueKey as string] ?? 0);
    names.add(name);

    if (!buckets.has(bucket)) buckets.set(bucket, { [String(bucketKey)]: bucket });
    buckets.get(bucket)![name] = value;
  }

  // Series order is sorted rather than first-seen, so a colour follows the
  // entity and does not shift when a filter changes which series appear.
  const seriesNames = [...names].sort();
  const data = [...buckets.values()].sort((a, b) =>
    String(a[String(bucketKey)]).localeCompare(String(b[String(bucketKey)]))
  );

  // Absent points become 0 so lines do not break into disconnected segments.
  for (const row of data) {
    for (const name of seriesNames) {
      if (row[name] === undefined) row[name] = 0;
    }
  }

  return { data, seriesNames };
}

/** Builds series definitions with stable colour slots. */
export function useSeriesDefs(names: string[], palette?: string[]): SeriesDef[] {
  return useMemo(() => {
    const sorted = [...names].sort();
    return sorted.map((name, i) => ({
      key: name,
      label: name,
      color: palette?.[i % palette.length] ?? `var(--chart-${(i % 8) + 1})`,
    }));
  }, [names, palette]);
}
