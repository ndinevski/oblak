/**
 * Service map.
 *
 * Draws the call graph derived from parent/child spans that cross a service
 * boundary, so the shape of the platform is visible rather than inferred.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AutoRefreshToggle,
  EmptyState,
  FilterBar,
  TelemetryUnavailable,
  TimeRangePicker,
} from '@/components/observability/controls';
import {
  useServiceMap,
  useServiceOverview,
  useTelemetryHealth,
  telemetryKeys,
} from '@/hooks/useTelemetry';
import {
  formatCount,
  formatDuration,
  seriesColor,
  type TimeRangeValue,
} from '@/lib/api/telemetry';

interface Node {
  id: string;
  x: number;
  y: number;
  requests: number;
  errorRate: number;
  p95Ms: number;
}

const WIDTH = 720;
const HEIGHT = 380;
const RADIUS = 34;

export default function ServiceMapPage() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<TimeRangeValue>('1h');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const health = useTelemetryHealth();
  const edges = useServiceMap({ range }, { autoRefresh });
  const stats = useServiceOverview({ range }, { autoRefresh });

  const { nodes, names } = useMemo(() => {
    const statsByService = new Map((stats.data ?? []).map((s) => [s.service, s]));

    // Every service that reported traffic appears, whether or not it has an
    // edge: an isolated node is information, not noise.
    const ids = new Set<string>();
    for (const edge of edges.data ?? []) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
    for (const stat of stats.data ?? []) ids.add(stat.service);

    const sorted = [...ids].sort();

    // Radial layout: with a handful of services it stays readable and, unlike
    // a force simulation, it is deterministic across refreshes so nodes do not
    // jump around while the reader is looking at them.
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const radius = Math.min(WIDTH, HEIGHT) / 2 - RADIUS - 24;

    const nodes: Node[] = sorted.map((id, i) => {
      const angle = (i / Math.max(sorted.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const stat = statsByService.get(id);
      return {
        id,
        x: sorted.length === 1 ? cx : cx + radius * Math.cos(angle),
        y: sorted.length === 1 ? cy : cy + radius * Math.sin(angle),
        requests: stat?.requests ?? 0,
        errorRate: stat?.errorRate ?? 0,
        p95Ms: stat?.p95Ms ?? 0,
      };
    });

    return { nodes, names: sorted };
  }, [edges.data, stats.data]);

  if (health.data && (!health.data.configured || !health.data.reachable)) {
    return (
      <div className="space-y-4">
        <Heading />
        <TelemetryUnavailable configured={health.data.configured} error={health.data.error} />
      </div>
    );
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeList = edges.data ?? [];
  const maxCalls = Math.max(1, ...edgeList.map((e) => e.calls));

  return (
    <div className="space-y-4">
      <Heading />

      <FilterBar>
        <TimeRangePicker value={range} onChange={setRange} />
        <AutoRefreshToggle
          enabled={autoRefresh}
          onToggle={setAutoRefresh}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: telemetryKeys.all })}
          isFetching={edges.isFetching}
        />
      </FilterBar>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Call graph</CardTitle>
          <p className="text-xs text-muted-foreground">
            Edges are spans whose parent ran in a different service
          </p>
        </CardHeader>
        <CardContent>
          {nodes.length === 0 ? (
            <EmptyState
              message="No services reported traces in this window"
              hint="Generate traffic to see the call graph"
            />
          ) : (
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="h-auto w-full"
                role="img"
                aria-label="Service dependency graph"
              >
                <defs>
                  <marker
                    id="arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--chart-axis)" />
                  </marker>
                </defs>

                {edgeList.map((edge) => {
                  const from = nodeById.get(edge.source);
                  const to = nodeById.get(edge.target);
                  if (!from || !to) return null;

                  // Stop the line at the node's edge so the arrowhead is not
                  // buried under the circle.
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;
                  const len = Math.hypot(dx, dy) || 1;
                  const x2 = to.x - (dx / len) * (RADIUS + 6);
                  const y2 = to.y - (dy / len) * (RADIUS + 6);
                  const x1 = from.x + (dx / len) * RADIUS;
                  const y1 = from.y + (dy / len) * RADIUS;

                  const hasErrors = edge.errorCalls > 0;
                  return (
                    <g key={`${edge.source}-${edge.target}`}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={hasErrors ? 'var(--status-critical)' : 'var(--chart-axis)'}
                        strokeWidth={1 + (edge.calls / maxCalls) * 3}
                        markerEnd="url(#arrow)"
                      />
                      <title>
                        {`${edge.source} → ${edge.target}: ${edge.calls} calls, ${edge.errorCalls} errors, p95 ${edge.p95Ms}ms`}
                      </title>
                    </g>
                  );
                })}

                {nodes.map((node) => (
                  <g key={node.id}>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={RADIUS}
                      fill={seriesColor(node.id, names)}
                      fillOpacity={0.15}
                      stroke={seriesColor(node.id, names)}
                      strokeWidth={2}
                    />
                    {/* Text wears text tokens, never the series colour: the
                        coloured ring beside it carries identity. */}
                    <text
                      x={node.x}
                      y={node.y - 2}
                      textAnchor="middle"
                      className="fill-foreground text-[11px] font-medium"
                    >
                      {node.id.length > 12 ? `${node.id.slice(0, 11)}…` : node.id}
                    </text>
                    <text
                      x={node.x}
                      y={node.y + 11}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[9px]"
                    >
                      {formatCount(node.requests)}
                    </text>
                    <title>{`${node.id}: ${node.requests} requests, ${node.errorRate}% errors, p95 ${node.p95Ms}ms`}</title>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </CardContent>
      </Card>

      {/* The table is the accessible equivalent of the diagram: everything the
          graph encodes visually is readable here. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Dependencies</CardTitle>
        </CardHeader>
        <CardContent>
          {edgeList.length === 0 ? (
            <EmptyState
              message="No cross-service calls recorded"
              hint="Each service is currently handling requests independently"
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">From</th>
                  <th className="py-2 pr-4 font-medium">To</th>
                  <th className="py-2 pr-4 text-right font-medium">Calls</th>
                  <th className="py-2 pr-4 text-right font-medium">Errors</th>
                  <th className="py-2 text-right font-medium">p95</th>
                </tr>
              </thead>
              <tbody>
                {edgeList.map((edge) => (
                  <tr
                    key={`${edge.source}-${edge.target}`}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-2 pr-4">{edge.source}</td>
                    <td className="py-2 pr-4">
                      <Link
                        to={`/observability/logs?service=${encodeURIComponent(edge.target)}`}
                        className="hover:underline"
                      >
                        {edge.target}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatCount(edge.calls)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {edge.errorCalls > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
                        >
                          {formatCount(edge.errorCalls)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatDuration(edge.p95Ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Heading() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Service map</h1>
      <p className="text-sm text-muted-foreground">
        How Oblak services call each other
      </p>
    </div>
  );
}
