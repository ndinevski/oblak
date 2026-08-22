/**
 * Telemetry routes.
 *
 * All read-only. Ordering matters: literal segments are declared before the
 * parameterised ones so /telemetry/logs/fields is not swallowed by a wildcard.
 */

const route = (
  method: string,
  path: string,
  handler: string,
  description: string,
) => ({
  method,
  path,
  handler,
  info: { type: "content-api" as const },
  config: {
    policies: [],
    middlewares: [],
    description,
    tags: ["Telemetry"],
  },
});

export default {
  routes: [
    route(
      "GET",
      "/telemetry/health",
      "telemetry.health",
      "Telemetry store connectivity",
    ),
    route(
      "GET",
      "/telemetry/summary",
      "telemetry.summary",
      "Headline observability counters",
    ),
    route(
      "GET",
      "/telemetry/services",
      "telemetry.services",
      "Services reporting telemetry",
    ),
    route(
      "GET",
      "/telemetry/service-overview",
      "telemetry.serviceOverview",
      "RED metrics per service",
    ),
    route(
      "GET",
      "/telemetry/service-map",
      "telemetry.serviceMap",
      "Service dependency edges",
    ),

    // Logs. Literal sub-paths first.
    route(
      "GET",
      "/telemetry/logs/histogram",
      "telemetry.logHistogram",
      "Log volume over time",
    ),
    route(
      "GET",
      "/telemetry/logs/fields",
      "telemetry.logFields",
      "Available log attribute keys",
    ),
    route(
      "GET",
      "/telemetry/logs/fields/:key/values",
      "telemetry.logFieldValues",
      "Values for a log attribute",
    ),
    route("GET", "/telemetry/logs", "telemetry.logs", "Search log records"),

    // Audit trail (replaces the Strapi activity log).
    route("GET", "/telemetry/audit", "telemetry.audit", "Audit trail"),

    // Traces.
    route("GET", "/telemetry/traces", "telemetry.traces", "List traces"),
    route(
      "GET",
      "/telemetry/traces/:traceId",
      "telemetry.trace",
      "All spans in one trace",
    ),

    // Metrics.
    route(
      "GET",
      "/telemetry/metrics/query",
      "telemetry.metricQuery",
      "Time series for one metric",
    ),
    route("GET", "/telemetry/metrics", "telemetry.metrics", "Metric catalogue"),
    route(
      "GET",
      "/telemetry/timeseries/requests",
      "telemetry.requestTimeseries",
      "Request rate and latency",
    ),
    route(
      "GET",
      "/telemetry/endpoints",
      "telemetry.endpoints",
      "Slowest endpoints",
    ),
    route(
      "GET",
      "/telemetry/containers",
      "telemetry.containers",
      "Per-container resource usage",
    ),
    route(
      "GET",
      "/telemetry/storage",
      "telemetry.storage",
      "Telemetry storage footprint",
    ),
  ],
};
