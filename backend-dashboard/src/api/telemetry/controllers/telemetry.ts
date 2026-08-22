/**
 * Telemetry API.
 *
 * Read-only endpoints over the ClickHouse telemetry store, giving the Oblak
 * dashboard one place to query logs, metrics and traces for every service.
 *
 * These endpoints replace the old Strapi-backed activity log: audit records
 * are now OpenTelemetry log records and are served from `/telemetry/audit`.
 */

import type { Context } from "koa";
import {
  getClickHouseClient,
  ClickHouseError,
} from "../../../telemetry/clickhouse";
import * as queries from "../../../telemetry/queries";
import type { TimeRange } from "../../../telemetry/queries";

/** Longest window a single query may span, to bound query cost. */
const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_MS = 60 * 60 * 1000;

const RELATIVE_RANGES: Record<string, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "3h": 3 * 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "2d": 2 * 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
};

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  // Accept both epoch millis and ISO-8601, since the UI sends millis and
  // hand-written calls tend to use ISO.
  const asNumber = Number(value);
  const date =
    Number.isFinite(asNumber) && value.trim() !== ""
      ? new Date(asNumber)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Resolves a time window from either `range=1h` or explicit `from`/`to`.
 * Always returns a bounded window so no query can scan all of retention.
 */
function resolveRange(ctx: Context): TimeRange {
  const query = ctx.query as Record<string, unknown>;

  const relative =
    typeof query.range === "string" ? RELATIVE_RANGES[query.range] : undefined;
  if (relative) {
    const to = new Date();
    return { from: new Date(to.getTime() - relative), to };
  }

  const to = parseDate(query.to) ?? new Date();
  const from =
    parseDate(query.from) ?? new Date(to.getTime() - DEFAULT_RANGE_MS);

  if (from >= to) {
    return { from: new Date(to.getTime() - DEFAULT_RANGE_MS), to };
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return { from: new Date(to.getTime() - MAX_RANGE_MS), to };
  }
  return { from, to };
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value)
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function parseNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseBool(value: unknown): boolean {
  return value === "true" || value === "1" || value === true;
}

/**
 * Collects `attr.<key>=<value>` query params into an attribute filter map.
 * Using a prefix keeps arbitrary attribute names from colliding with the
 * endpoint's own parameters.
 */
function parseAttributes(ctx: Context): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    ctx.query as Record<string, unknown>,
  )) {
    if (key.startsWith("attr.") && typeof value === "string" && value) {
      out[key.slice("attr.".length)] = value;
    }
  }
  return out;
}

function logFiltersFrom(ctx: Context): queries.LogFilters {
  const range = resolveRange(ctx);
  const query = ctx.query as Record<string, unknown>;

  return {
    ...range,
    services: parseList(query.services),
    severities: parseList(query.severities),
    minSeverity: parseNumber(query.minSeverity),
    search: typeof query.search === "string" ? query.search : undefined,
    traceId: typeof query.traceId === "string" ? query.traceId : undefined,
    attributes: parseAttributes(ctx),
    auditOnly: parseBool(query.auditOnly),
    auditAction: typeof query.action === "string" ? query.action : undefined,
    userId: typeof query.userId === "string" ? query.userId : undefined,
    limit: parseNumber(query.limit),
    offset: parseNumber(query.offset),
  };
}

/**
 * Wraps a handler so a telemetry-store outage becomes a clean 503 with a
 * usable message, instead of a stack trace or a hanging request. The dashboard
 * renders that as "telemetry unavailable" rather than breaking the page.
 */
async function handle(
  ctx: Context,
  fn: (
    ch: NonNullable<ReturnType<typeof getClickHouseClient>>,
  ) => Promise<unknown>,
) {
  const ch = getClickHouseClient();
  if (!ch) {
    return ctx.send(
      {
        error: {
          status: 503,
          name: "TelemetryUnconfigured",
          message:
            "Telemetry storage is not configured. Set CLICKHOUSE_URL to enable the observability features.",
        },
      },
      503,
    );
  }

  try {
    const data = await fn(ch);
    return { data };
  } catch (error) {
    if (error instanceof ClickHouseError) {
      strapi.log.error(`Telemetry query failed: ${error.message}`);
      return ctx.send(
        {
          error: {
            status: error.status >= 500 ? error.status : 502,
            name: "TelemetryQueryError",
            message: error.message,
          },
        },
        error.status >= 500 ? error.status : 502,
      );
    }
    throw error;
  }
}

export default {
  /** Reports whether the telemetry store is reachable and which tables exist. */
  async health(ctx: Context) {
    const ch = getClickHouseClient();
    if (!ch) {
      return { data: { configured: false, reachable: false, tables: [] } };
    }
    const health = await ch.health();
    return { data: { configured: true, ...health } };
  },

  async summary(ctx: Context) {
    return handle(ctx, (ch) => queries.summary(ch, resolveRange(ctx)));
  },

  async services(ctx: Context) {
    return handle(ctx, (ch) => queries.listServices(ch, resolveRange(ctx)));
  },

  async serviceOverview(ctx: Context) {
    return handle(ctx, (ch) => queries.serviceOverview(ch, resolveRange(ctx)));
  },

  // --- Logs ----------------------------------------------------------------

  async logs(ctx: Context) {
    return handle(ctx, async (ch) => {
      const filters = logFiltersFrom(ctx);
      const { rows, total } = await queries.searchLogs(ch, filters);
      return {
        rows,
        total,
        limit: filters.limit ?? 100,
        offset: filters.offset ?? 0,
        range: {
          from: filters.from.toISOString(),
          to: filters.to.toISOString(),
        },
      };
    });
  },

  async logHistogram(ctx: Context) {
    return handle(ctx, (ch) =>
      queries.logHistogram(
        ch,
        logFiltersFrom(ctx),
        parseNumber((ctx.query as any).buckets) ?? 60,
      ),
    );
  },

  async logFields(ctx: Context) {
    return handle(ctx, (ch) =>
      queries.logAttributeKeys(ch, logFiltersFrom(ctx)),
    );
  },

  async logFieldValues(ctx: Context) {
    const key = ctx.params.key;
    if (!key) {
      return ctx.badRequest("A field key is required");
    }
    return handle(ctx, (ch) =>
      queries.logAttributeValues(ch, logFiltersFrom(ctx), key),
    );
  },

  // --- Audit trail ---------------------------------------------------------

  /**
   * The audit trail, served from the telemetry store. This is the replacement
   * for the old `/activity-logs` endpoint.
   */
  async audit(ctx: Context) {
    return handle(ctx, async (ch) => {
      // Scoped to the caller. The endpoint this replaced filtered every query
      // by ctx.state.user.id, and the Activity view presents these as "your"
      // actions; without this a signed-in user reads everyone's audit trail.
      // A caller-supplied userId is deliberately ignored rather than honoured.
      const callerId = ctx.state.user?.id;
      const filters = {
        ...logFiltersFrom(ctx),
        auditOnly: true,
        userId: callerId === undefined ? undefined : String(callerId),
      };
      const { rows, total } = await queries.searchLogs(ch, filters);

      // Reshape the flat attribute map into the audit record the UI expects,
      // so the frontend does not have to know the attribute naming scheme.
      const entries = rows.map((row) => ({
        timestampMs: row.timestampMs,
        action: row.attributes["oblak.audit.action"] ?? row.body,
        resourceType: row.attributes["oblak.audit.resource_type"] ?? null,
        resourceId: row.attributes["oblak.audit.resource_id"] ?? null,
        resourceName: row.attributes["oblak.audit.resource_name"] ?? null,
        status: row.attributes["oblak.audit.status"] ?? "success",
        userId: row.attributes["oblak.audit.user_id"] ?? null,
        userEmail: row.attributes["oblak.audit.user_email"] ?? null,
        ipAddress: row.attributes["client.address"] ?? null,
        userAgent: row.attributes["user_agent.original"] ?? null,
        errorMessage: row.attributes["error.message"] ?? null,
        durationMs: row.attributes["oblak.audit.duration_ms"]
          ? Number(row.attributes["oblak.audit.duration_ms"])
          : null,
        traceId: row.traceId || null,
        service: row.service,
        details: Object.fromEntries(
          Object.entries(row.attributes)
            .filter(([k]) => k.startsWith("oblak.audit.detail."))
            .map(([k, v]) => [k.slice("oblak.audit.detail.".length), v]),
        ),
      }));

      return {
        rows: entries,
        total,
        limit: filters.limit ?? 100,
        offset: filters.offset ?? 0,
      };
    });
  },

  // --- Traces --------------------------------------------------------------

  async traces(ctx: Context) {
    return handle(ctx, async (ch) => {
      const range = resolveRange(ctx);
      const query = ctx.query as Record<string, unknown>;
      return queries.listTraces(ch, {
        ...range,
        services: parseList(query.services),
        spanName:
          typeof query.spanName === "string" ? query.spanName : undefined,
        minDurationMs: parseNumber(query.minDurationMs),
        errorsOnly: parseBool(query.errorsOnly),
        limit: parseNumber(query.limit),
        offset: parseNumber(query.offset),
      });
    });
  },

  async trace(ctx: Context) {
    const traceId = ctx.params.traceId;
    // Trace ids are 32 hex characters; rejecting anything else early avoids a
    // pointless full-table probe on a malformed id.
    if (!traceId || !/^[0-9a-f]{32}$/i.test(traceId)) {
      return ctx.badRequest("A valid 32-character hex trace id is required");
    }
    return handle(ctx, async (ch) => {
      const spans = await queries.getTrace(ch, traceId.toLowerCase());
      if (!spans.length) {
        return ctx.notFound("Trace not found or outside the retention window");
      }
      return { traceId, spans };
    });
  },

  async serviceMap(ctx: Context) {
    return handle(ctx, (ch) => queries.serviceMap(ch, resolveRange(ctx)));
  },

  async requestTimeseries(ctx: Context) {
    return handle(ctx, (ch) =>
      queries.requestTimeseries(
        ch,
        resolveRange(ctx),
        parseList((ctx.query as any).services),
        parseNumber((ctx.query as any).buckets) ?? 60,
      ),
    );
  },

  async endpoints(ctx: Context) {
    return handle(ctx, (ch) =>
      queries.topEndpoints(
        ch,
        resolveRange(ctx),
        parseList((ctx.query as any).services),
        parseNumber((ctx.query as any).limit) ?? 20,
      ),
    );
  },

  // --- Metrics -------------------------------------------------------------

  async metrics(ctx: Context) {
    return handle(ctx, (ch) => queries.listMetrics(ch, resolveRange(ctx)));
  },

  async metricQuery(ctx: Context) {
    const query = ctx.query as Record<string, unknown>;
    const name = typeof query.name === "string" ? query.name : "";
    if (!name) {
      return ctx.badRequest("A metric name is required");
    }

    return handle(ctx, (ch) =>
      queries.queryMetric(ch, {
        ...resolveRange(ctx),
        name,
        type: typeof query.type === "string" ? query.type : "gauge",
        services: parseList(query.services),
        attributes: parseAttributes(ctx),
        groupBy: typeof query.groupBy === "string" ? query.groupBy : undefined,
        buckets: parseNumber(query.buckets) ?? 60,
      }),
    );
  },

  async containers(ctx: Context) {
    return handle(ctx, (ch) =>
      queries.containerResources(ch, resolveRange(ctx)),
    );
  },

  async storage(ctx: Context) {
    return handle(ctx, (ch) => queries.storageStats(ch));
  },
};
