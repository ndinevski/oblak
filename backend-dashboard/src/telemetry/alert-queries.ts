/**
 * Rule-type evaluation queries.
 *
 * Each alert rule names a rule *type* rather than carrying raw SQL. That keeps
 * arbitrary queries out of a user-editable field, bounds evaluation cost, and
 * lets the dashboard offer a real form instead of a SQL box.
 *
 * Every query returns a single number for the rule's window, or null when
 * there is nothing to measure.
 */

import type { ClickHouseClient } from "./clickhouse";

export type RuleType =
  | "service.error_rate"
  | "service.latency_p95"
  | "service.request_rate"
  | "service.absent"
  | "log.error_count"
  | "host.cpu"
  | "host.memory"
  | "host.disk"
  | "container.memory"
  | "container.absent"
  | "postgres.connections"
  | "postgres.slow_queries"
  | "postgres.slowest_query"
  | "tefter.replication_lag"
  | "tefter.db_down";

export interface RuleTypeMeta {
  label: string;
  /** Unit shown next to the threshold in the UI. */
  unit: string;
  /** What `target` means for this rule type, or null when it takes none. */
  targetLabel: string | null;
  /** Whether the target may be left blank to mean "any". */
  targetOptional: boolean;
  description: string;
}

/**
 * Catalogue served to the dashboard so the rule form can be built from the
 * backend's own definition rather than a duplicated list in the frontend.
 */
export const RULE_TYPES: Record<RuleType, RuleTypeMeta> = {
  "service.error_rate": {
    label: "Service error rate",
    unit: "%",
    targetLabel: "Service",
    targetOptional: true,
    description: "Percentage of server spans that ended in an error.",
  },
  "service.latency_p95": {
    label: "Service p95 latency",
    unit: "ms",
    targetLabel: "Service",
    targetOptional: true,
    description: "95th percentile server span duration.",
  },
  "service.request_rate": {
    label: "Service request rate",
    unit: "req/min",
    targetLabel: "Service",
    targetOptional: true,
    description: "Server spans per minute.",
  },
  "service.absent": {
    label: "Service not reporting",
    unit: "datapoints",
    targetLabel: "Service",
    targetOptional: false,
    description:
      'Metric datapoints exported by the service in the window. A healthy service exports these on a timer even when idle, so use with "below" and a threshold of 1 to detect a service that has stopped reporting.',
  },
  "log.error_count": {
    label: "Error log count",
    unit: "records",
    targetLabel: "Service",
    targetOptional: true,
    description: "Log records at ERROR severity or above.",
  },
  "host.cpu": {
    label: "Host CPU usage",
    unit: "%",
    targetLabel: null,
    targetOptional: true,
    description: "Host CPU utilisation, excluding idle.",
  },
  "host.memory": {
    label: "Host memory usage",
    unit: "%",
    targetLabel: null,
    targetOptional: true,
    description: "Host memory utilisation, excluding free and cached.",
  },
  "host.disk": {
    label: "Host disk usage",
    unit: "%",
    targetLabel: "Mount point",
    targetOptional: true,
    description:
      "Filesystem utilisation. Leave the mount point blank for the fullest filesystem.",
  },
  "container.memory": {
    label: "Container memory",
    unit: "MB",
    targetLabel: "Container",
    targetOptional: true,
    description: "Container memory usage.",
  },
  "container.absent": {
    label: "Container not reporting",
    unit: "samples",
    targetLabel: "Container",
    targetOptional: false,
    description:
      'Metric samples received from the container. Use with "below" and a threshold of 1 to detect a stopped container.',
  },
  "postgres.connections": {
    label: "Postgres connections",
    unit: "connections",
    targetLabel: "Database",
    targetOptional: true,
    description: "Active backend connections.",
  },
  "postgres.slow_queries": {
    label: "Postgres slow statements",
    unit: "statements",
    targetLabel: "Database",
    targetOptional: true,
    description:
      "Distinct statements whose mean execution time exceeds 100ms, from pg_stat_statements.",
  },
  "postgres.slowest_query": {
    label: "Postgres slowest statement",
    unit: "ms",
    targetLabel: "Database",
    targetOptional: true,
    description:
      "Mean execution time of the slowest tracked statement, from pg_stat_statements.",
  },
  "tefter.replication_lag": {
    label: "Tefter replica lag",
    unit: "s",
    targetLabel: "Instance",
    targetOptional: true,
    description:
      "How far a Tefter read replica is behind its primary. Leave the instance blank to alert on the worst replica.",
  },
  "tefter.db_down": {
    label: "Tefter database down",
    unit: "up",
    targetLabel: "Instance",
    targetOptional: true,
    description:
      'Whether a Tefter database answered its stats probe. Use with "below" and a threshold of 1 to detect an instance that is running but not responding. Leave the instance blank to cover all of them.',
  },
};

export function isRuleType(value: string): value is RuleType {
  return Object.prototype.hasOwnProperty.call(RULE_TYPES, value);
}

interface EvalContext {
  ch: ClickHouseClient;
  from: Date;
  to: Date;
  target?: string | null;
}

/** Runs a single-value query and returns the number, or null if there is no row. */
async function scalar(
  ch: ClickHouseClient,
  sql: string,
  params: Record<string, string | number | boolean | Date>,
): Promise<number | null> {
  const result = await ch.query<{ value: string | number | null }>(sql, params);
  const raw = result.data[0]?.value;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Evaluates one rule type over its window.
 *
 * Returns null when the window holds no data. A null is not a breach: an alert
 * that fires simply because nothing happened would be noise. The two "absent"
 * rule types are the deliberate exception, since zero is exactly the signal.
 */
export async function evaluateRuleType(
  type: RuleType,
  ctx: EvalContext,
): Promise<number | null> {
  const { ch, from, to, target } = ctx;
  const base = { from, to };
  const hasTarget = Boolean(target);

  switch (type) {
    case "service.error_rate":
      return scalar(
        ch,
        `SELECT round(countIf(StatusCode = 'Error') / greatest(count(), 1) * 100, 3) AS value
         FROM otel_traces
         WHERE Timestamp >= {from:DateTime64(9)} AND Timestamp <= {to:DateTime64(9)}
           AND SpanKind = 'Server'
           AND (${hasTarget ? "ServiceName = {target:String}" : "1"})
         HAVING count() > 0`,
        hasTarget ? { ...base, target: target! } : base,
      );

    case "service.latency_p95":
      return scalar(
        ch,
        `SELECT round(quantile(0.95)(Duration) / 1e6, 3) AS value
         FROM otel_traces
         WHERE Timestamp >= {from:DateTime64(9)} AND Timestamp <= {to:DateTime64(9)}
           AND SpanKind = 'Server'
           AND (${hasTarget ? "ServiceName = {target:String}" : "1"})
         HAVING count() > 0`,
        hasTarget ? { ...base, target: target! } : base,
      );

    case "service.request_rate": {
      const minutes = Math.max((to.getTime() - from.getTime()) / 60000, 1 / 60);
      const total = await scalar(
        ch,
        `SELECT count() AS value FROM otel_traces
         WHERE Timestamp >= {from:DateTime64(9)} AND Timestamp <= {to:DateTime64(9)}
           AND SpanKind = 'Server'
           AND (${hasTarget ? "ServiceName = {target:String}" : "1"})`,
        hasTarget ? { ...base, target: target! } : base,
      );
      return total === null
        ? null
        : Math.round((total / minutes) * 1000) / 1000;
    }

    case "service.absent":
      // Liveness is measured from exported metric datapoints, not trace spans.
      // A service's periodic metric reader exports on a timer (every ~15s)
      // whether or not it is serving traffic, so an idle-but-healthy service
      // still reports. Trace spans, by contrast, only appear when a request
      // arrives, which would make a quiet service look absent and page someone
      // for nothing. Counts always return a row, so zero (the "not reporting"
      // signal being detected) is reported rather than null.
      return scalar(
        ch,
        `SELECT count() AS value FROM otel_metrics_sum
         WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
           AND ResourceAttributes['service.name'] = {target:String}`,
        { ...base, target: target ?? "" },
      );

    case "log.error_count":
      return scalar(
        ch,
        `SELECT count() AS value FROM otel_logs
         WHERE Timestamp >= {from:DateTime64(9)} AND Timestamp <= {to:DateTime64(9)}
           AND SeverityNumber >= 17
           AND (${hasTarget ? "ServiceName = {target:String}" : "1"})`,
        hasTarget ? { ...base, target: target! } : base,
      );

    case "host.cpu":
      // system.cpu.utilization is reported per-core and per-state as a 0..1
      // ratio. Averaging the non-idle states across cores gives host busy %.
      return scalar(
        ch,
        `SELECT round(avg(Value) * 100, 3) AS value
         FROM otel_metrics_gauge
         WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
           AND MetricName = 'system.cpu.utilization'
           AND Attributes['state'] != 'idle'
         HAVING count() > 0`,
        base,
      );

    case "host.memory":
      // system.memory.usage is a *sum* (bytes per state), not a gauge. The
      // gauge table only holds system.memory.utilization.
      return scalar(
        ch,
        `SELECT round(sumIf(Value, Attributes['state'] IN ('used', 'buffered', 'slab_reclaimable'))
                      / greatest(sum(Value), 1) * 100, 3) AS value
         FROM (
           SELECT Attributes, argMax(Value, TimeUnix) AS Value
           FROM otel_metrics_sum
           WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
             AND MetricName = 'system.memory.usage'
           GROUP BY Attributes
         )
         HAVING sum(Value) > 0`,
        base,
      );

    case "host.disk":
      // Reports the fullest matching filesystem: an alert should trip on the
      // worst mount point, not on the average across them.
      return scalar(
        ch,
        `SELECT round(max(pct), 3) AS value FROM (
           SELECT
             Attributes['mountpoint'] AS mount,
             sumIf(Value, Attributes['state'] = 'used')
               / greatest(sum(Value), 1) * 100 AS pct
           FROM (
             SELECT Attributes, argMax(Value, TimeUnix) AS Value
             FROM otel_metrics_sum
             WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
               AND MetricName = 'system.filesystem.usage'
             GROUP BY Attributes
           )
           GROUP BY mount
           HAVING sum(Value) > 0 ${hasTarget ? "AND mount = {target:String}" : ""}
         )`,
        hasTarget ? { ...base, target: target! } : base,
      );

    case "container.memory":
      // container.memory.usage.total is reported as a sum, not a gauge.
      return scalar(
        ch,
        `SELECT round(max(Value) / 1024 / 1024, 3) AS value
         FROM otel_metrics_sum
         WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
           AND MetricName = 'container.memory.usage.total'
           AND (${hasTarget ? "ResourceAttributes['container.name'] = {target:String}" : "1"})
         HAVING count() > 0`,
        hasTarget ? { ...base, target: target! } : base,
      );

    case "container.absent":
      return scalar(
        ch,
        `SELECT count() AS value
         FROM otel_metrics_gauge
         WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
           AND ResourceAttributes['container.name'] = {target:String}`,
        { ...base, target: target ?? "" },
      );

    case "postgres.connections":
      return scalar(
        ch,
        `SELECT round(max(Value), 0) AS value
         FROM otel_metrics_sum
         WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
           AND MetricName = 'postgresql.backends'
           AND (${hasTarget ? "ResourceAttributes['postgresql.database.name'] = {target:String}" : "1"})
         HAVING count() > 0`,
        hasTarget ? { ...base, target: target! } : base,
      );

    case "postgres.slow_queries":
    case "postgres.slowest_query": {
      // Emitted by the sqlquery receiver from pg_stat_statements. A database
      // without the extension simply reports nothing, which surfaces as
      // "unknown" rather than a false all-clear.
      const metric =
        type === "postgres.slow_queries"
          ? "postgresql.slow_queries"
          : "postgresql.slowest_query_mean_ms";

      return scalar(
        ch,
        `SELECT round(max(Value), 3) AS value
         FROM otel_metrics_gauge
         WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
           AND MetricName = {metric:String}
           AND (${hasTarget ? "Attributes['postgresql.database.name'] = {target:String}" : "1"})
         HAVING count() > 0`,
        hasTarget ? { ...base, metric, target: target! } : { ...base, metric },
      );
    }

    case "tefter.replication_lag":
      // Emitted by Tefter's stats collector, one series per replica. Report
      // the worst replica in the window (or the named one), so a single
      // lagging follower trips the alert rather than being averaged away.
      return scalar(
        ch,
        `SELECT round(max(Value), 3) AS value
         FROM otel_metrics_gauge
         WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
           AND MetricName = 'tefter.db.replication.lag'
           AND (${hasTarget ? "Attributes['db.instance'] = {target:String}" : "1"})
         HAVING count() > 0`,
        hasTarget ? { ...base, target: target! } : base,
      );

    case "tefter.db_down":
      // tefter.db.up is 1 when the database answered and 0 when it did not.
      // Take the latest reading per instance, then the minimum across them, so
      // the value is 0 if any covered instance is down and 1 only when every
      // one is healthy. Null when the collector reported nothing at all, which
      // the "Tefter not reporting" rule covers instead.
      return scalar(
        ch,
        `SELECT min(latest) AS value FROM (
           SELECT Attributes['db.instance'] AS inst, argMax(Value, TimeUnix) AS latest
           FROM otel_metrics_gauge
           WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
             AND MetricName = 'tefter.db.up'
             AND (${hasTarget ? "Attributes['db.instance'] = {target:String}" : "1"})
           GROUP BY inst
         )
         HAVING count() > 0`,
        hasTarget ? { ...base, target: target! } : base,
      );

    default: {
      // Exhaustiveness guard: adding a rule type without a query is a compile
      // error rather than a silently unevaluated rule.
      const exhaustive: never = type;
      throw new Error(`Unhandled alert rule type: ${String(exhaustive)}`);
    }
  }
}
