/**
 * Minimal ClickHouse HTTP client for the telemetry query API.
 *
 * Deliberately dependency-free: the query API only needs to POST SQL and read
 * JSON back, and ClickHouse's HTTP interface does exactly that. Adding the
 * official driver would pull a connection pool and a large dependency tree in
 * for a handful of read-only queries.
 *
 * SAFETY: never interpolate user input into SQL here. Every caller must use
 * bound parameters, which ClickHouse exposes as {name:Type} placeholders
 * supplied as param_<name> query-string values. `query()` enforces this by
 * only accepting parameters through its `params` argument.
 */

export interface ClickHouseConfig {
  url: string;
  database: string;
  username: string;
  password: string;
  /** Per-query server-side timeout, in seconds. */
  timeoutSeconds?: number;
}

export type ClickHouseParamValue =
  | string
  | number
  | boolean
  | Date
  | string[]
  | number[];

export interface QueryResult<T> {
  data: T[];
  rows: number;
  statistics?: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

export class ClickHouseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly query?: string,
  ) {
    super(message);
    this.name = "ClickHouseError";
  }
}

/**
 * Formats a JS value for ClickHouse's param_* transport, which is always
 * textual. Arrays use ClickHouse's own literal syntax.
 */
function formatParam(value: ClickHouseParamValue): string {
  if (value instanceof Date) {
    // ClickHouse DateTime64 parses this format directly and it avoids any
    // locale/timezone ambiguity from toString().
    return value.toISOString().replace("T", " ").replace("Z", "");
  }
  if (Array.isArray(value)) {
    const inner = value
      .map((v) =>
        typeof v === "number"
          ? String(v)
          : `'${String(v).replace(/'/g, "\\'")}'`,
      )
      .join(",");
    return `[${inner}]`;
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return String(value);
}

export class ClickHouseClient {
  private readonly config: Required<ClickHouseConfig>;

  constructor(config: ClickHouseConfig) {
    this.config = {
      timeoutSeconds: 30,
      ...config,
      url: config.url.replace(/\/$/, ""),
    };
  }

  get database(): string {
    return this.config.database;
  }

  /**
   * Runs a read-only SQL query and returns typed rows.
   *
   * @param sql    SQL using {name:Type} placeholders for every dynamic value.
   * @param params Values for those placeholders.
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: Record<string, ClickHouseParamValue> = {},
  ): Promise<QueryResult<T>> {
    const search = new URLSearchParams({
      database: this.config.database,
      default_format: "JSON",
      // Defence in depth: even if a query were somehow malformed into a write,
      // the server refuses it. readonly=2 still permits settings changes we
      // send below, unlike readonly=1.
      readonly: "2",
      max_execution_time: String(this.config.timeoutSeconds),
    });

    for (const [key, value] of Object.entries(params)) {
      search.set(`param_${key}`, formatParam(value));
    }

    const controller = new AbortController();
    // Client-side timeout slightly beyond the server's, so the server's own
    // error surfaces in preference to an opaque abort.
    const timer = setTimeout(
      () => controller.abort(),
      (this.config.timeoutSeconds + 5) * 1000,
    );

    let response: Response;
    try {
      response = await fetch(`${this.config.url}/?${search.toString()}`, {
        method: "POST",
        body: sql,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-ClickHouse-User": this.config.username,
          "X-ClickHouse-Key": this.config.password,
        },
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (controller.signal.aborted) {
        throw new ClickHouseError(
          `Telemetry query timed out after ${this.config.timeoutSeconds}s`,
          504,
          sql,
        );
      }
      throw new ClickHouseError(
        `Telemetry store unreachable: ${message}`,
        503,
        sql,
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();

    if (!response.ok) {
      throw new ClickHouseError(
        `Telemetry query failed: ${text.slice(0, 500)}`,
        response.status,
        sql,
      );
    }

    // A query with no result set (rare here) returns an empty body.
    if (!text.trim()) {
      return { data: [], rows: 0 };
    }

    try {
      const parsed = JSON.parse(text);
      return {
        data: (parsed.data ?? []) as T[],
        rows: parsed.rows ?? parsed.data?.length ?? 0,
        statistics: parsed.statistics,
      };
    } catch {
      throw new ClickHouseError(
        "Telemetry store returned malformed JSON",
        502,
        sql,
      );
    }
  }

  /** Reports whether the telemetry store is reachable and holds the schema. */
  async health(): Promise<{
    reachable: boolean;
    tables: string[];
    error?: string;
  }> {
    try {
      const result = await this.query<{ name: string }>(
        `SELECT name FROM system.tables WHERE database = {db:String} ORDER BY name`,
        { db: this.config.database },
      );
      return { reachable: true, tables: result.data.map((r) => r.name) };
    } catch (error) {
      return {
        reachable: false,
        tables: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

let singleton: ClickHouseClient | null = null;

/**
 * Returns the shared client, or null when telemetry storage is not configured
 * so callers can degrade instead of throwing at import time.
 */
export function getClickHouseClient(): ClickHouseClient | null {
  if (singleton) {
    return singleton;
  }

  const url = process.env.CLICKHOUSE_URL;
  if (!url) {
    return null;
  }

  singleton = new ClickHouseClient({
    url,
    database: process.env.CLICKHOUSE_DB || "otel",
    username: process.env.CLICKHOUSE_USER || "default",
    password: process.env.CLICKHOUSE_PASSWORD || "",
  });

  return singleton;
}

/** Test seam: drops the cached client so env changes take effect. */
export function resetClickHouseClient(): void {
  singleton = null;
}
