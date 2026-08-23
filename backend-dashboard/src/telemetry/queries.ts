/**
 * SQL layer for the Oblak telemetry API.
 *
 * Every function here is read-only and time-bounded. Callers pass a resolved
 * TimeRange rather than raw strings so that a missing bound can never turn
 * into a full-retention table scan.
 *
 * All dynamic values are passed as ClickHouse bound parameters. Query shape is
 * assembled in code; user input is never concatenated into SQL.
 */

import { ClickHouseClient, ClickHouseParamValue } from "./clickhouse";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface TimeRange {
  from: Date;
  to: Date;
}

export interface LogFilters extends TimeRange {
  services?: string[];
  /** Minimum OTel severity number (9 = INFO, 13 = WARN, 17 = ERROR). */
  minSeverity?: number;
  severities?: string[];
  /** Case-insensitive substring match against the log body. */
  search?: string;
  traceId?: string;
  /** Exact attribute matches, e.g. { 'http.route': '/api/v1/functions' }. */
  attributes?: Record<string, string>;
  /** Restrict to audit-trail records only. */
  auditOnly?: boolean;
  /** Restrict to a single audit action, e.g. "bucket.create". */
  auditAction?: string;
  /** Restrict to a single acting user. */
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface LogRow {
  timestampMs: number;
  service: string;
  severityText: string;
  severityNumber: number;
  body: string;
  traceId: string;
  spanId: string;
  attributes: Record<string, string>;
  resourceAttributes: Record<string, string>;
}

export interface TraceFilters extends TimeRange {
  services?: string[];
  /** Only spans at or above this duration, in milliseconds. */
  minDurationMs?: number;
  /** Only traces containing an error span. */
  errorsOnly?: boolean;
  spanName?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Clause building
// ---------------------------------------------------------------------------

/**
 * Accumulates WHERE fragments and their bound parameters together, so a clause
 * can never be added without its value (or vice versa).
 */
class ClauseBuilder {
  readonly clauses: string[] = [];
  readonly params: Record<string, ClickHouseParamValue> = {};
  private counter = 0;

  /** Adds a clause containing a single `??` placeholder for the value. */
  add(template: string, value: ClickHouseParamValue, type: string): void {
    const name = `p${this.counter++}`;
    this.clauses.push(template.replace("??", `{${name}:${type}}`));
    this.params[name] = value;
  }

  /** Adds a clause with no bound value. */
  addRaw(clause: string): void {
    this.clauses.push(clause);
  }

  /** Reserves a named parameter for use outside the WHERE clause. */
  bind(name: string, value: ClickHouseParamValue): string {
    this.params[name] = value;
    return name;
  }

  where(): string {
    return this.clauses.length ? `WHERE ${this.clauses.join(" AND ")}` : "";
  }
}

function applyTimeRange(
  b: ClauseBuilder,
  range: TimeRange,
  column = "Timestamp",
): void {
  b.add(`${column} >= ??`, range.from, "DateTime64(9)");
  b.add(`${column} <= ??`, range.to, "DateTime64(9)");
}

/** Caps page size so a client cannot ask for an unbounded result set. */
function clampLimit(
  limit: number | undefined,
  fallback: number,
  max: number,
): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), max);
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

function buildLogClauses(filters: LogFilters): ClauseBuilder {
  const b = new ClauseBuilder();
  applyTimeRange(b, filters);

  if (filters.services?.length) {
    b.add("ServiceName IN ??", filters.services, "Array(String)");
  }
  if (typeof filters.minSeverity === "number" && filters.minSeverity > 0) {
    b.add("SeverityNumber >= ??", filters.minSeverity, "UInt8");
  }
  if (filters.severities?.length) {
    b.add("SeverityText IN ??", filters.severities, "Array(String)");
  }
  if (filters.search) {
    // positionCaseInsensitive avoids the cost of lower() on every row and
    // matches the substring semantics users expect from a log search box.
    b.add("positionCaseInsensitive(Body, ??) > 0", filters.search, "String");
  }
  if (filters.traceId) {
    b.add("TraceId = ??", filters.traceId, "String");
  }
  if (filters.auditOnly) {
    b.addRaw(`LogAttributes['oblak.audit.event'] = 'true'`);
  }
  if (filters.auditAction) {
    b.add(
      `LogAttributes['oblak.audit.action'] = ??`,
      filters.auditAction,
      "String",
    );
  }
  if (filters.userId) {
    b.add(
      `LogAttributes['oblak.audit.user_id'] = ??`,
      filters.userId,
      "String",
    );
  }
  for (const [key, value] of Object.entries(filters.attributes ?? {})) {
    // The key is bound too: attribute names come from the UI's filter builder.
    const keyName = b.bind(`ak${Object.keys(b.params).length}`, key);
    b.add(`LogAttributes[{${keyName}:String}] = ??`, value, "String");
  }

  return b;
}

export async function searchLogs(
  ch: ClickHouseClient,
  filters: LogFilters,
): Promise<{ rows: LogRow[]; total: number }> {
  const b = buildLogClauses(filters);
  const limit = clampLimit(filters.limit, 100, 1000);
  const offset = Math.max(0, Math.floor(filters.offset ?? 0));

  const sql = `
    SELECT
      -- Epoch millis rather than a formatted string: unambiguous across
      -- timezones and directly consumable by JS Date on the client.
      toUnixTimestamp64Milli(Timestamp) AS timestampMs,
      ServiceName        AS service,
      SeverityText       AS severityText,
      SeverityNumber     AS severityNumber,
      Body               AS body,
      TraceId            AS traceId,
      SpanId             AS spanId,
      LogAttributes      AS attributes,
      ResourceAttributes AS resourceAttributes
    FROM otel_logs
    ${b.where()}
    ORDER BY Timestamp DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Counting is a separate query rather than a window function: on wide time
  // ranges the count scans far less data without the row payload.
  const countSql = `SELECT count() AS total FROM otel_logs ${b.where()}`;

  const [rowsResult, countResult] = await Promise.all([
    ch.query<LogRow>(sql, b.params),
    ch.query<{ total: string }>(countSql, b.params),
  ]);

  return {
    // ClickHouse serialises 64-bit integers as JSON strings so that large
    // values survive the round trip. Coerce here so the API keeps its
    // declared numeric contract and clients can use the value directly.
    rows: rowsResult.data.map((row) => ({
      ...row,
      timestampMs: Number(row.timestampMs),
      severityNumber: Number(row.severityNumber),
    })),
    total: Number(countResult.data[0]?.total ?? 0),
  };
}

/**
 * Counts log records per time bucket and severity, for the histogram above
 * the log explorer.
 */
export async function logHistogram(
  ch: ClickHouseClient,
  filters: LogFilters,
  buckets = 60,
): Promise<Array<{ bucket: string; severityText: string; count: number }>> {
  const b = buildLogClauses(filters);
  const stepSeconds = Math.max(
    1,
    Math.floor(
      (filters.to.getTime() - filters.from.getTime()) / 1000 / buckets,
    ),
  );
  b.bind("step", stepSeconds);

  const sql = `
    SELECT
      formatDateTime(toStartOfInterval(Timestamp, toIntervalSecond({step:UInt32})), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS bucket,
      SeverityText AS severityText,
      count()      AS count
    FROM otel_logs
    ${b.where()}
    GROUP BY bucket, severityText
    ORDER BY bucket
  `;

  const result = await ch.query<{
    bucket: string;
    severityText: string;
    count: string;
  }>(sql, b.params);
  return result.data.map((r) => ({ ...r, count: Number(r.count) }));
}

/**
 * Returns the attribute keys present on matching logs, which powers the
 * "filter by field" affordance in the explorer.
 */
export async function logAttributeKeys(
  ch: ClickHouseClient,
  filters: LogFilters,
  limit = 100,
): Promise<Array<{ key: string; count: number }>> {
  const b = buildLogClauses(filters);

  const sql = `
    SELECT key, count() AS count
    FROM otel_logs
    ARRAY JOIN mapKeys(LogAttributes) AS key
    ${b.where()}
    GROUP BY key
    ORDER BY count DESC
    LIMIT ${clampLimit(limit, 100, 500)}
  `;

  const result = await ch.query<{ key: string; count: string }>(sql, b.params);
  return result.data.map((r) => ({ key: r.key, count: Number(r.count) }));
}

/** Distinct values for one attribute key, for filter autocomplete. */
export async function logAttributeValues(
  ch: ClickHouseClient,
  filters: LogFilters,
  key: string,
  limit = 50,
): Promise<Array<{ value: string; count: number }>> {
  const b = buildLogClauses(filters);
  b.bind("attrKey", key);
  b.addRaw(`has(mapKeys(LogAttributes), {attrKey:String})`);

  const sql = `
    SELECT LogAttributes[{attrKey:String}] AS value, count() AS count
    FROM otel_logs
    ${b.where()}
    GROUP BY value
    ORDER BY count DESC
    LIMIT ${clampLimit(limit, 50, 200)}
  `;

  const result = await ch.query<{ value: string; count: string }>(
    sql,
    b.params,
  );
  return result.data.map((r) => ({ value: r.value, count: Number(r.count) }));
}

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------

export async function listTraces(
  ch: ClickHouseClient,
  filters: TraceFilters,
): Promise<{ rows: unknown[]; total: number }> {
  const b = new ClauseBuilder();
  applyTimeRange(b, filters);
  // Root spans only: one row per trace in the list view.
  b.addRaw(`ParentSpanId = ''`);

  if (filters.services?.length) {
    b.add("ServiceName IN ??", filters.services, "Array(String)");
  }
  if (filters.spanName) {
    b.add("SpanName = ??", filters.spanName, "String");
  }
  if (filters.minDurationMs && filters.minDurationMs > 0) {
    b.add("Duration >= ??", Math.floor(filters.minDurationMs * 1e6), "UInt64");
  }
  if (filters.errorsOnly) {
    b.addRaw(`StatusCode = 'Error'`);
  }

  const limit = clampLimit(filters.limit, 50, 500);
  const offset = Math.max(0, Math.floor(filters.offset ?? 0));

  const sql = `
    SELECT
      TraceId                     AS traceId,
      SpanId                      AS spanId,
      formatDateTime(Timestamp, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS timestamp,
      ServiceName                 AS service,
      SpanName                    AS name,
      Duration / 1e6              AS durationMs,
      StatusCode                  AS statusCode,
      StatusMessage               AS statusMessage,
      SpanAttributes['http.response.status_code'] AS httpStatus,
      SpanAttributes['http.request.method']       AS httpMethod,
      SpanAttributes['http.route']                AS httpRoute
    FROM otel_traces
    ${b.where()}
    ORDER BY Timestamp DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countSql = `SELECT count() AS total FROM otel_traces ${b.where()}`;

  const [rows, count] = await Promise.all([
    ch.query(sql, b.params),
    ch.query<{ total: string }>(countSql, b.params),
  ]);

  return { rows: rows.data, total: Number(count.data[0]?.total ?? 0) };
}

/** Every span in one trace, ordered for a waterfall rendering. */
export async function getTrace(
  ch: ClickHouseClient,
  traceId: string,
): Promise<unknown[]> {
  const sql = `
    SELECT
      TraceId       AS traceId,
      SpanId        AS spanId,
      ParentSpanId  AS parentSpanId,
      ServiceName   AS service,
      SpanName      AS name,
      SpanKind      AS kind,
      toUnixTimestamp64Milli(Timestamp) AS startMs,
      Duration / 1e6 AS durationMs,
      StatusCode    AS statusCode,
      StatusMessage AS statusMessage,
      SpanAttributes AS attributes,
      Events.Timestamp AS eventTimestamps,
      Events.Name      AS eventNames,
      Events.Attributes AS eventAttributes
    FROM otel_traces
    WHERE TraceId = {traceId:String}
    ORDER BY Timestamp ASC
    LIMIT 5000
  `;
  const result = await ch.query<Record<string, unknown>>(sql, { traceId });
  // startMs is a 64-bit value and therefore arrives as a string; the waterfall
  // does arithmetic on it, so coerce before it leaves the API.
  return result.data.map((span) => ({
    ...span,
    startMs: Number(span.startMs),
    durationMs: Number(span.durationMs),
  }));
}

/**
 * Derives service-to-service edges from parent/child spans, which is what the
 * dashboard draws as a service map.
 */
export async function serviceMap(
  ch: ClickHouseClient,
  range: TimeRange,
): Promise<
  Array<{
    source: string;
    target: string;
    calls: number;
    errorCalls: number;
    p95Ms: number;
  }>
> {
  const sql = `
    SELECT
      parent.ServiceName AS source,
      child.ServiceName  AS target,
      count()            AS calls,
      countIf(child.StatusCode = 'Error') AS errorCalls,
      round(quantile(0.95)(child.Duration) / 1e6, 2) AS p95Ms
    FROM otel_traces AS child
    INNER JOIN otel_traces AS parent
      ON child.ParentSpanId = parent.SpanId AND child.TraceId = parent.TraceId
    WHERE child.Timestamp >= {from:DateTime64(9)}
      AND child.Timestamp <= {to:DateTime64(9)}
      AND parent.Timestamp >= {from:DateTime64(9)}
      AND parent.Timestamp <= {to:DateTime64(9)}
      AND parent.ServiceName != child.ServiceName
    GROUP BY source, target
    ORDER BY calls DESC
    LIMIT 200
  `;

  const result = await ch.query<{
    source: string;
    target: string;
    calls: string;
    errorCalls: string;
    p95Ms: number;
  }>(sql, { from: range.from, to: range.to });

  return result.data.map((r) => ({
    source: r.source,
    target: r.target,
    calls: Number(r.calls),
    errorCalls: Number(r.errorCalls),
    p95Ms: Number(r.p95Ms),
  }));
}

// ---------------------------------------------------------------------------
// Services and RED metrics
// ---------------------------------------------------------------------------

/**
 * Rate / Errors / Duration per service, derived from spans rather than from
 * the metric tables. Spans carry the status code directly, so this stays
 * correct even for a service that only exports traces.
 */
export async function serviceOverview(
  ch: ClickHouseClient,
  range: TimeRange,
): Promise<unknown[]> {
  const sql = `
    SELECT
      ServiceName AS service,
      count()     AS requests,
      countIf(StatusCode = 'Error') AS errors,
      round(countIf(StatusCode = 'Error') / greatest(count(), 1) * 100, 2) AS errorRate,
      round(avg(Duration) / 1e6, 2)              AS avgMs,
      round(quantile(0.50)(Duration) / 1e6, 2)   AS p50Ms,
      round(quantile(0.95)(Duration) / 1e6, 2)   AS p95Ms,
      round(quantile(0.99)(Duration) / 1e6, 2)   AS p99Ms,
      max(Timestamp)                             AS lastSeen
    FROM otel_traces
    WHERE Timestamp >= {from:DateTime64(9)}
      AND Timestamp <= {to:DateTime64(9)}
      AND SpanKind = 'Server'
    GROUP BY service
    ORDER BY requests DESC
  `;
  const result = await ch.query(sql, { from: range.from, to: range.to });
  return result.data;
}

/** Request rate and error rate over time for one or more services. */
export async function requestTimeseries(
  ch: ClickHouseClient,
  range: TimeRange,
  services: string[] = [],
  buckets = 60,
): Promise<unknown[]> {
  const b = new ClauseBuilder();
  applyTimeRange(b, range);
  b.addRaw(`SpanKind = 'Server'`);
  if (services.length) {
    b.add("ServiceName IN ??", services, "Array(String)");
  }
  const stepSeconds = Math.max(
    1,
    Math.floor((range.to.getTime() - range.from.getTime()) / 1000 / buckets),
  );
  b.bind("step", stepSeconds);

  const sql = `
    SELECT
      formatDateTime(toStartOfInterval(Timestamp, toIntervalSecond({step:UInt32})), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS bucket,
      ServiceName AS service,
      count()     AS requests,
      countIf(StatusCode = 'Error') AS errors,
      round(quantile(0.95)(Duration) / 1e6, 2) AS p95Ms,
      round(avg(Duration) / 1e6, 2)            AS avgMs
    FROM otel_traces
    ${b.where()}
    GROUP BY bucket, service
    ORDER BY bucket
  `;

  const result = await ch.query(sql, b.params);
  return result.data;
}

/** Slowest endpoints across the selected window. */
export async function topEndpoints(
  ch: ClickHouseClient,
  range: TimeRange,
  services: string[] = [],
  limit = 20,
): Promise<unknown[]> {
  const b = new ClauseBuilder();
  applyTimeRange(b, range);
  b.addRaw(`SpanKind = 'Server'`);
  if (services.length) {
    b.add("ServiceName IN ??", services, "Array(String)");
  }

  const sql = `
    SELECT
      ServiceName AS service,
      SpanName    AS endpoint,
      count()     AS requests,
      countIf(StatusCode = 'Error') AS errors,
      round(quantile(0.95)(Duration) / 1e6, 2) AS p95Ms,
      round(avg(Duration) / 1e6, 2)            AS avgMs
    FROM otel_traces
    ${b.where()}
    GROUP BY service, endpoint
    ORDER BY p95Ms DESC
    LIMIT ${clampLimit(limit, 20, 200)}
  `;

  const result = await ch.query(sql, b.params);
  return result.data;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Metric names available in the window, with the table that holds them. */
export async function listMetrics(
  ch: ClickHouseClient,
  range: TimeRange,
): Promise<
  Array<{
    name: string;
    type: string;
    unit: string;
    description: string;
    service: string;
  }>
> {
  // UNION over the metric tables: the collector splits metrics by instrument
  // type, so a single catalogue has to look in each.
  const sql = `
    SELECT DISTINCT MetricName AS name, 'gauge' AS type, MetricUnit AS unit, MetricDescription AS description, ServiceName AS service
    FROM otel_metrics_gauge
    WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
    UNION ALL
    SELECT DISTINCT MetricName AS name, 'sum' AS type, MetricUnit AS unit, MetricDescription AS description, ServiceName AS service
    FROM otel_metrics_sum
    WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
    UNION ALL
    SELECT DISTINCT MetricName AS name, 'histogram' AS type, MetricUnit AS unit, MetricDescription AS description, ServiceName AS service
    FROM otel_metrics_histogram
    WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
    ORDER BY name
    LIMIT 2000
  `;

  const result = await ch.query<{
    name: string;
    type: string;
    unit: string;
    description: string;
    service: string;
  }>(sql, { from: range.from, to: range.to });
  return result.data;
}

export interface MetricQuery extends TimeRange {
  name: string;
  /** gauge | sum | histogram */
  type?: string;
  services?: string[];
  /** Exact attribute matches to narrow the series. */
  attributes?: Record<string, string>;
  /** Attribute key to break the series down by. */
  groupBy?: string;
  buckets?: number;
}

/**
 * Time series for one metric.
 *
 * Gauges are averaged within a bucket; counters (sums) are differenced,
 * because the stored value is cumulative and a raw average of it would show a
 * meaningless upward ramp instead of a rate.
 */
export async function queryMetric(
  ch: ClickHouseClient,
  q: MetricQuery,
): Promise<unknown[]> {
  const type = q.type || "gauge";
  const table =
    type === "sum"
      ? "otel_metrics_sum"
      : type === "histogram"
        ? "otel_metrics_histogram"
        : "otel_metrics_gauge";

  const b = new ClauseBuilder();
  applyTimeRange(b, q, "TimeUnix");
  b.add("MetricName = ??", q.name, "String");
  if (q.services?.length) {
    b.add("ServiceName IN ??", q.services, "Array(String)");
  }
  for (const [key, value] of Object.entries(q.attributes ?? {})) {
    const keyName = b.bind(`mk${Object.keys(b.params).length}`, key);
    b.add(`Attributes[{${keyName}:String}] = ??`, value, "String");
  }

  const stepSeconds = Math.max(
    1,
    Math.floor((q.to.getTime() - q.from.getTime()) / 1000 / (q.buckets ?? 60)),
  );
  b.bind("step", stepSeconds);

  // A breakdown key can live in either map: application metrics put their
  // dimensions in Attributes, while receiver-generated metrics (Postgres,
  // containers, host devices) put them in ResourceAttributes. Checking both
  // means one group-by control works for every metric in the catalogue.
  const seriesExpr = q.groupBy
    ? `if(Attributes[{groupKey:String}] != '', Attributes[{groupKey:String}], ResourceAttributes[{groupKey:String}])`
    : `ServiceName`;
  if (q.groupBy) {
    b.bind("groupKey", q.groupBy);
  }

  if (type === "histogram") {
    const sql = `
      SELECT
        formatDateTime(toStartOfInterval(TimeUnix, toIntervalSecond({step:UInt32})), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS bucket,
        ${seriesExpr} AS series,
        sum(Count)    AS count,
        round(sum(Sum) / greatest(sum(Count), 1), 2) AS avg,
        round(max(Max), 2) AS max
      FROM ${table}
      ${b.where()}
      GROUP BY bucket, series
      ORDER BY bucket
    `;
    const result = await ch.query(sql, b.params);
    return result.data;
  }

  if (type === "sum") {
    // The sum table holds two different things, distinguished by IsMonotonic:
    //
    //  - monotonic sums are cumulative counters (request counts, commits).
    //    Charting the raw value shows a meaningless upward ramp, so the
    //    per-bucket delta is the useful quantity.
    //  - non-monotonic sums are current values that happen to be reported as
    //    sums (Postgres connections, container and host memory). Differencing
    //    those yields ~0 and hides the actual reading.
    //
    // Branching on the flag means one endpoint charts both correctly.
    const sql = `
      SELECT
        bucket,
        series,
        round(
          if(
            isMonotonic,
            greatest(value - lagInFrame(value) OVER (PARTITION BY series ORDER BY bucket), 0),
            value
          ),
        4) AS value
      FROM (
        SELECT
          formatDateTime(toStartOfInterval(TimeUnix, toIntervalSecond({step:UInt32})), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS bucket,
          ${seriesExpr} AS series,
          max(Value) AS value,
          max(IsMonotonic) AS isMonotonic
        FROM ${table}
        ${b.where()}
        GROUP BY bucket, series
        ORDER BY series, bucket
      )
      ORDER BY bucket
    `;
    const result = await ch.query(sql, b.params);
    return result.data;
  }

  const sql = `
    SELECT
      formatDateTime(toStartOfInterval(TimeUnix, toIntervalSecond({step:UInt32})), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS bucket,
      ${seriesExpr}      AS series,
      round(avg(Value), 4) AS value,
      round(max(Value), 4) AS max,
      round(min(Value), 4) AS min
    FROM ${table}
    ${b.where()}
    GROUP BY bucket, series
    ORDER BY bucket
  `;

  const result = await ch.query(sql, b.params);
  return result.data;
}

/**
 * Per-container CPU and memory, which is how the dashboard shows resource use
 * for services Oblak does not instrument in code (Postgres, MinIO, Immich).
 */
export async function containerResources(
  ch: ClickHouseClient,
  range: TimeRange,
): Promise<unknown[]> {
  const sql = `
    SELECT
      container,
      round(max(memoryBytes) / 1024 / 1024, 1) AS memoryMb,
      round(max(cpuPercent), 2)                AS cpuPercent
    FROM (
      SELECT
        ResourceAttributes['container.name'] AS container,
        TimeUnix,
        anyIf(Value, MetricName = 'container.memory.usage.total') AS memoryBytes,
        anyIf(Value, MetricName = 'container.cpu.utilization')    AS cpuPercent
      FROM otel_metrics_gauge
      WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
        AND MetricName IN ('container.memory.usage.total', 'container.cpu.utilization')
        AND ResourceAttributes['container.name'] != ''
      GROUP BY container, TimeUnix
    )
    GROUP BY container
    ORDER BY container
  `;
  const result = await ch.query(sql, { from: range.from, to: range.to });
  return result.data;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

/** All services that reported any signal in the window. */
export async function listServices(
  ch: ClickHouseClient,
  range: TimeRange,
): Promise<Array<{ service: string; signals: string[] }>> {
  const sql = `
    SELECT service, groupUniqArray(signal) AS signals
    FROM (
      SELECT DISTINCT ServiceName AS service, 'traces' AS signal FROM otel_traces
        WHERE Timestamp >= {from:DateTime64(9)} AND Timestamp <= {to:DateTime64(9)}
      UNION ALL
      SELECT DISTINCT ServiceName AS service, 'logs' AS signal FROM otel_logs
        WHERE Timestamp >= {from:DateTime64(9)} AND Timestamp <= {to:DateTime64(9)}
      UNION ALL
      SELECT DISTINCT ServiceName AS service, 'metrics' AS signal FROM otel_metrics_sum
        WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
      UNION ALL
      SELECT DISTINCT ServiceName AS service, 'metrics' AS signal FROM otel_metrics_gauge
        WHERE TimeUnix >= {from:DateTime64(9)} AND TimeUnix <= {to:DateTime64(9)}
    )
    WHERE service != ''
    GROUP BY service
    ORDER BY service
  `;
  const result = await ch.query<{ service: string; signals: string[] }>(sql, {
    from: range.from,
    to: range.to,
  });
  return result.data;
}

/** Headline counters for the observability landing page. */
export async function summary(
  ch: ClickHouseClient,
  range: TimeRange,
): Promise<unknown> {
  const params = { from: range.from, to: range.to };

  const [logs, traces, services, errors] = await Promise.all([
    ch.query<{ total: string; errors: string }>(
      `SELECT count() AS total, countIf(SeverityNumber >= 17) AS errors
       FROM otel_logs WHERE Timestamp >= {from:DateTime64(9)} AND Timestamp <= {to:DateTime64(9)}`,
      params,
    ),
    ch.query<{ total: string; errors: string; p95: number }>(
      `SELECT count() AS total,
              countIf(StatusCode = 'Error') AS errors,
              round(quantile(0.95)(Duration) / 1e6, 2) AS p95
       FROM otel_traces
       WHERE Timestamp >= {from:DateTime64(9)} AND Timestamp <= {to:DateTime64(9)} AND SpanKind = 'Server'`,
      params,
    ),
    ch.query<{ total: string }>(
      `SELECT uniq(ServiceName) AS total FROM otel_traces
       WHERE Timestamp >= {from:DateTime64(9)} AND Timestamp <= {to:DateTime64(9)}`,
      params,
    ),
    ch.query<{ service: string; count: string }>(
      `SELECT ServiceName AS service, count() AS count FROM otel_logs
       WHERE Timestamp >= {from:DateTime64(9)} AND Timestamp <= {to:DateTime64(9)}
         AND SeverityNumber >= 17
       GROUP BY service ORDER BY count DESC LIMIT 5`,
      params,
    ),
  ]);

  const traceRow = traces.data[0];
  const requestCount = Number(traceRow?.total ?? 0);
  const errorCount = Number(traceRow?.errors ?? 0);

  return {
    logs: {
      total: Number(logs.data[0]?.total ?? 0),
      errors: Number(logs.data[0]?.errors ?? 0),
    },
    requests: {
      total: requestCount,
      errors: errorCount,
      errorRate: requestCount
        ? Number(((errorCount / requestCount) * 100).toFixed(2))
        : 0,
      p95Ms: Number(traceRow?.p95 ?? 0),
    },
    services: Number(services.data[0]?.total ?? 0),
    topErrorServices: errors.data.map((r) => ({
      service: r.service,
      count: Number(r.count),
    })),
  };
}

/** Storage footprint per signal, so retention can be reasoned about. */
export async function storageStats(ch: ClickHouseClient): Promise<unknown[]> {
  const sql = `
    SELECT
      table,
      sum(rows)                          AS rows,
      formatReadableSize(sum(bytes_on_disk)) AS diskSize,
      sum(bytes_on_disk)                 AS diskBytes
    FROM system.parts
    WHERE database = {db:String} AND active
    GROUP BY table
    ORDER BY diskBytes DESC
  `;
  const result = await ch.query(sql, { db: ch.database });
  return result.data;
}

// ---------------------------------------------------------------------------
// Audit-derived helpers
// ---------------------------------------------------------------------------

/**
 * Counts audit events matching one action for one user in a window.
 *
 * Used for quota accounting (for example "function invocations today"), which
 * previously counted rows in Strapi's activity_logs table.
 */
export async function countAuditAction(
  ch: ClickHouseClient,
  range: TimeRange,
  action: string,
  userId?: string | number | null,
): Promise<number> {
  const b = new ClauseBuilder();
  applyTimeRange(b, range);
  b.addRaw(`LogAttributes['oblak.audit.event'] = 'true'`);
  b.add(`LogAttributes['oblak.audit.action'] = ??`, action, "String");
  if (userId !== undefined && userId !== null && userId !== "") {
    b.add(
      `LogAttributes['oblak.audit.user_id'] = ??`,
      String(userId),
      "String",
    );
  }

  const result = await ch.query<{ total: string }>(
    `SELECT count() AS total FROM otel_logs ${b.where()}`,
    b.params,
  );
  return Number(result.data[0]?.total ?? 0);
}

export interface InvocationLogEntry {
  timestampMs: number;
  status: string;
  durationMs: number | null;
  traceId: string;
  errorMessage: string | null;
  runtimeLogs: { stdout: string[]; stderr: string[] } | null;
  details: Record<string, string>;
}

/**
 * Invocation history for a single function, read from the audit trail.
 *
 * Resource ids are matched against both the numeric id and the documentId,
 * because callers may hold either depending on where the reference came from.
 */
export async function functionInvocationLogs(
  ch: ClickHouseClient,
  range: TimeRange,
  opts: {
    userId?: string | number | null;
    resourceIds: string[];
    limit?: number;
  },
): Promise<InvocationLogEntry[]> {
  const b = new ClauseBuilder();
  applyTimeRange(b, range);
  b.addRaw(`LogAttributes['oblak.audit.event'] = 'true'`);
  b.add(
    `LogAttributes['oblak.audit.action'] = ??`,
    "function.invoke",
    "String",
  );

  if (opts.resourceIds.length) {
    b.add(
      `LogAttributes['oblak.audit.resource_id'] IN ??`,
      opts.resourceIds,
      "Array(String)",
    );
  }
  if (opts.userId !== undefined && opts.userId !== null) {
    b.add(
      `LogAttributes['oblak.audit.user_id'] = ??`,
      String(opts.userId),
      "String",
    );
  }

  const sql = `
    SELECT
      toUnixTimestamp64Milli(Timestamp)               AS timestampMs,
      LogAttributes['oblak.audit.status']             AS status,
      LogAttributes['oblak.audit.duration_ms']        AS durationRaw,
      TraceId                                         AS traceId,
      LogAttributes['error.message']                  AS errorMessage,
      LogAttributes                                   AS attributes
    FROM otel_logs
    ${b.where()}
    ORDER BY Timestamp DESC
    LIMIT ${clampLimit(opts.limit, 50, 500)}
  `;

  const result = await ch.query<{
    timestampMs: number;
    status: string;
    durationRaw: string;
    traceId: string;
    errorMessage: string;
    attributes: Record<string, string>;
  }>(sql, b.params);

  // The audit stores the function's captured stdout/stderr as newline-joined
  // strings under oblak.audit.detail.runtimeLogs.{stdout,stderr}. Split them
  // back into the arrays the dashboard's log view expects.
  const splitLines = (s: string | undefined): string[] =>
    s ? s.split("\n").filter((l) => l.length > 0) : [];

  return result.data.map((r) => {
    const attrs = r.attributes || {};
    const stdout = splitLines(attrs["oblak.audit.detail.runtimeLogs.stdout"]);
    const stderr = splitLines(attrs["oblak.audit.detail.runtimeLogs.stderr"]);
    return {
      timestampMs: Number(r.timestampMs),
      status: r.status || "success",
      durationMs: r.durationRaw ? Number(r.durationRaw) : null,
      traceId: r.traceId,
      errorMessage: r.errorMessage || null,
      runtimeLogs:
        stdout.length || stderr.length ? { stdout, stderr } : null,
      details: Object.fromEntries(
        Object.entries(attrs)
          .filter(([k]) => k.startsWith("oblak.audit.detail."))
          .map(([k, v]) => [k.slice("oblak.audit.detail.".length), v]),
      ),
    };
  });
}
