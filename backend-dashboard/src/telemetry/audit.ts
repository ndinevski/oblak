/**
 * Audit trail emitter.
 *
 * Audit events used to be rows in Strapi's `activity_logs` table. They are now
 * OpenTelemetry log records, which means they land in the same store as
 * service logs, metrics and traces and can be correlated with them: an audit
 * entry for "object.upload" carries the trace id of the request that did it,
 * so the dashboard can jump straight from the audit row to the full trace.
 *
 * Emission is fire-and-forget by design. An audit write must never fail the
 * user action that triggered it, and must never add latency to it.
 */

import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { trace } from "@opentelemetry/api";

/** Outcome of the audited action. */
export type AuditStatus = "success" | "failure" | "pending";

/** The Oblak service or subsystem the action belongs to. */
export type AuditResourceType =
  | "function"
  | "virtual-machine"
  | "bucket"
  | "object"
  | "user"
  | "polaroid"
  | "container"
  | "database"
  | "gateway"
  | "telemetry";

export interface AuditEvent {
  /** Dotted action name, e.g. "bucket.create" or "function.invoke". */
  action: string;
  resourceType: AuditResourceType;
  resourceId?: string | number | null;
  resourceName?: string | null;
  /** Numeric Strapi user id, when the action was user-initiated. */
  userId?: number | null;
  userEmail?: string | null;
  status?: AuditStatus;
  /** Arbitrary structured context. Flattened into attributes. */
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  errorMessage?: string | null;
  /** Wall-clock duration of the audited action. */
  durationMs?: number | null;
}

const LOGGER_NAME = "oblak.audit";

/**
 * Attribute keys are namespaced under `oblak.audit.*` so the log explorer can
 * separate audit records from ordinary application logs with a single filter.
 */
const ATTR_PREFIX = "oblak.audit";

function severityFor(status: AuditStatus): {
  number: SeverityNumber;
  text: string;
} {
  switch (status) {
    case "failure":
      return { number: SeverityNumber.ERROR, text: "ERROR" };
    case "pending":
      return { number: SeverityNumber.DEBUG, text: "DEBUG" };
    default:
      return { number: SeverityNumber.INFO, text: "INFO" };
  }
}

/**
 * Flattens nested detail objects into dotted attribute keys, because the
 * telemetry store indexes flat string maps rather than nested JSON.
 * Depth is capped so a pathological payload cannot blow up a log record.
 */
function flattenDetails(
  value: unknown,
  prefix: string,
  out: Record<string, string | number | boolean>,
  depth = 0,
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (depth > 3) {
    out[prefix] = "[truncated]";
    return;
  }

  if (Array.isArray(value)) {
    // Arrays are summarised rather than exploded: a 500-key attribute map is
    // useless in a log viewer and expensive to store.
    out[`${prefix}.count`] = value.length;
    if (
      value.length > 0 &&
      value.length <= 10 &&
      value.every((v) => typeof v !== "object")
    ) {
      out[prefix] = value.map((v) => String(v)).join(",");
    }
    return;
  }

  if (typeof value === "object") {
    for (const [key, inner] of Object.entries(
      value as Record<string, unknown>,
    )) {
      flattenDetails(inner, `${prefix}.${key}`, out, depth + 1);
    }
    return;
  }

  if (typeof value === "string") {
    // Guard against a stray blob (base64 payload, stack trace) bloating rows.
    out[prefix] =
      value.length > 1024 ? `${value.slice(0, 1024)}...[truncated]` : value;
    return;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    out[prefix] = value;
  }
}

/**
 * Records an audit event. Safe to call from anywhere; never throws.
 */
export function recordAudit(event: AuditEvent): void {
  try {
    const status: AuditStatus = event.status ?? "success";
    const severity = severityFor(status);

    const attributes: Record<string, string | number | boolean> = {
      [`${ATTR_PREFIX}.action`]: event.action,
      [`${ATTR_PREFIX}.resource_type`]: event.resourceType,
      [`${ATTR_PREFIX}.status`]: status,
      // Marker attribute so audit records are trivially separable from the
      // application logs sharing these tables.
      [`${ATTR_PREFIX}.event`]: true,
    };

    if (event.resourceId !== null && event.resourceId !== undefined) {
      attributes[`${ATTR_PREFIX}.resource_id`] = String(event.resourceId);
    }
    if (event.resourceName) {
      attributes[`${ATTR_PREFIX}.resource_name`] = event.resourceName;
    }
    if (event.userId !== null && event.userId !== undefined) {
      attributes[`${ATTR_PREFIX}.user_id`] = String(event.userId);
    }
    if (event.userEmail) {
      attributes[`${ATTR_PREFIX}.user_email`] = event.userEmail;
    }
    if (event.ipAddress) {
      attributes["client.address"] = event.ipAddress;
    }
    if (event.userAgent) {
      attributes["user_agent.original"] = event.userAgent;
    }
    if (event.errorMessage) {
      attributes["error.message"] = event.errorMessage;
    }
    if (typeof event.durationMs === "number") {
      attributes[`${ATTR_PREFIX}.duration_ms`] = event.durationMs;
    }
    if (event.details) {
      flattenDetails(event.details, `${ATTR_PREFIX}.detail`, attributes);
    }

    // Attaching the active span's ids lets the dashboard link an audit row to
    // the request trace that produced it.
    const span = trace.getActiveSpan();
    if (span) {
      const ctx = span.spanContext();
      attributes["trace_id"] = ctx.traceId;
      attributes["span_id"] = ctx.spanId;
    }

    logs.getLogger(LOGGER_NAME).emit({
      severityNumber: severity.number,
      severityText: severity.text,
      body: event.action,
      attributes,
    });
  } catch {
    // Auditing must never break the operation being audited. There is
    // deliberately no rethrow and no console noise here: a broken telemetry
    // pipeline should degrade silently rather than spam every request.
  }
}

/**
 * Convenience wrapper that derives request metadata from a Koa context.
 */
export function recordAuditFromContext(
  ctx: {
    state?: { user?: { id?: number; email?: string } };
    request?: { ip?: string; header?: Record<string, unknown> };
    ip?: string;
  } | null,
  event: Omit<AuditEvent, "userId" | "userEmail" | "ipAddress" | "userAgent">,
): void {
  const user = ctx?.state?.user;
  const userAgent = ctx?.request?.header?.["user-agent"];

  recordAudit({
    ...event,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    ipAddress: ctx?.request?.ip ?? ctx?.ip ?? null,
    userAgent: typeof userAgent === "string" ? userAgent : null,
  });
}
