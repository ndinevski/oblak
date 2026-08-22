/**
 * Alert evaluation.
 *
 * Rules live in Postgres because they are configuration and need transactional
 * state to deduplicate notifications. Every state change is *also* emitted as
 * an OpenTelemetry log record, so the firing history is visible in the log
 * explorer next to the telemetry that caused it, and ages out with the same
 * retention.
 *
 * The evaluator is deliberately conservative:
 *  - a rule whose query fails goes to `unknown`, never to `firing`; an
 *    unreachable telemetry store must not page anyone,
 *  - a window with no data is not a breach, except for the two "absent" rule
 *    types where zero is the signal,
 *  - notifications fire on state *transitions* only, so a rule that stays
 *    firing does not re-notify every cycle.
 */

import type { Core } from "@strapi/strapi";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { getClickHouseClient } from "./clickhouse";
import {
  evaluateRuleType,
  isRuleType,
  RULE_TYPES,
  type RuleType,
} from "./alert-queries";

export type AlertState = "ok" | "pending" | "firing" | "unknown";

export interface AlertRule {
  id: number;
  documentId?: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  ruleType: string;
  target?: string | null;
  comparison: "gt" | "lt";
  threshold: number;
  windowMinutes: number;
  forMinutes: number;
  severity: "warning" | "critical";
  notifyWebhook?: string | null;
  notifyEmail?: string | null;
  /** Minimum gap between notifications, damping a flapping rule. */
  notifyCooldownMinutes?: number | null;
  /** While in the future, the rule evaluates but stays silent. */
  mutedUntil?: string | null;
  state: AlertState;
  lastValue?: number | null;
  breachingSince?: string | null;
  stateChangedAt?: string | null;
  lastNotifiedAt?: string | null;
}

export interface EvaluationResult {
  ruleId: number;
  name: string;
  previousState: AlertState;
  state: AlertState;
  value: number | null;
  changed: boolean;
  error?: string;
}

const UID = "api::alert-rule.alert-rule";
const LOGGER_NAME = "oblak.alerts";

/** Default evaluation cadence. Overridden by ALERT_EVAL_INTERVAL_SECONDS. */
const DEFAULT_INTERVAL_SECONDS = 60;

/** Guards against two evaluator ticks overlapping on a slow telemetry store. */
let evaluating = false;

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function breaches(
  value: number,
  comparison: "gt" | "lt",
  threshold: number,
): boolean {
  return comparison === "gt" ? value > threshold : value < threshold;
}

/** Human-readable condition, used in notifications and log bodies. */
export function describeCondition(rule: AlertRule): string {
  const meta = isRuleType(rule.ruleType)
    ? RULE_TYPES[rule.ruleType as RuleType]
    : null;
  const label = meta?.label ?? rule.ruleType;
  const unit = meta?.unit ? ` ${meta.unit}` : "";
  const direction = rule.comparison === "gt" ? "above" : "below";
  const scope = rule.target ? ` for ${rule.target}` : "";
  return `${label}${scope} ${direction} ${rule.threshold}${unit} over ${rule.windowMinutes}m`;
}

/**
 * Evaluates one rule and returns the state it should now be in, without
 * writing anything. Split out from persistence so it can be unit tested and
 * reused by the "test this rule" endpoint.
 */
export async function evaluateRule(
  rule: AlertRule,
  now: Date = new Date(),
): Promise<{
  state: AlertState;
  value: number | null;
  breachingSince: Date | null;
  error?: string;
}> {
  const ch = getClickHouseClient();
  if (!ch) {
    return {
      state: "unknown",
      value: null,
      breachingSince: null,
      error: "Telemetry storage is not configured",
    };
  }

  if (!isRuleType(rule.ruleType)) {
    return {
      state: "unknown",
      value: null,
      breachingSince: null,
      error: `Unknown rule type: ${rule.ruleType}`,
    };
  }

  const windowMs = Math.max(1, rule.windowMinutes) * 60_000;
  const from = new Date(now.getTime() - windowMs);

  let value: number | null;
  try {
    value = await evaluateRuleType(rule.ruleType, {
      ch,
      from,
      to: now,
      target: rule.target,
    });
  } catch (error) {
    // A failing query must not be read as a breach.
    return {
      state: "unknown",
      value: null,
      breachingSince: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (value === null) {
    // No data in the window. Treated as "nothing to say" rather than healthy,
    // so a silent service does not look green.
    return {
      state: "unknown",
      value: null,
      breachingSince: null,
      error: "No data in window",
    };
  }

  if (!breaches(value, rule.comparison, rule.threshold)) {
    return { state: "ok", value, breachingSince: null };
  }

  // Breaching. Whether it fires depends on how long it has been breaching.
  const since = rule.breachingSince ? new Date(rule.breachingSince) : now;
  const sustainedMs = now.getTime() - since.getTime();
  const requiredMs = Math.max(0, rule.forMinutes) * 60_000;

  return {
    state: sustainedMs >= requiredMs ? "firing" : "pending",
    value,
    breachingSince: since,
  };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

interface Transition {
  rule: AlertRule;
  from: AlertState;
  to: AlertState;
  value: number | null;
  at: Date;
  /** Set when the notification was withheld, so the log explains the silence. */
  suppressed?: SuppressionReason;
}

/**
 * Emits the transition into the telemetry store.
 *
 * This is what makes alert history queryable next to the data that caused it,
 * and it happens regardless of whether any notification channel is configured.
 */
function emitTransitionLog(transition: Transition): void {
  const { rule, from, to, value, at } = transition;
  try {
    const firing = to === "firing";
    logs.getLogger(LOGGER_NAME).emit({
      severityNumber: firing
        ? rule.severity === "critical"
          ? SeverityNumber.FATAL
          : SeverityNumber.ERROR
        : SeverityNumber.INFO,
      severityText: firing
        ? rule.severity === "critical"
          ? "FATAL"
          : "ERROR"
        : "INFO",
      body: firing ? `Alert firing: ${rule.name}` : `Alert ${to}: ${rule.name}`,
      attributes: {
        "oblak.alert.event": true,
        "oblak.alert.rule": rule.name,
        "oblak.alert.rule_id": String(rule.id),
        "oblak.alert.type": rule.ruleType,
        "oblak.alert.severity": rule.severity,
        "oblak.alert.state": to,
        "oblak.alert.previous_state": from,
        "oblak.alert.condition": describeCondition(rule),
        ...(rule.target ? { "oblak.alert.target": rule.target } : {}),
        ...(value !== null ? { "oblak.alert.value": value } : {}),
        "oblak.alert.threshold": rule.threshold,
        "oblak.alert.at": at.toISOString(),
        ...(transition.suppressed
          ? { "oblak.alert.notification_suppressed": transition.suppressed }
          : {}),
      },
    });
  } catch {
    // Never let a telemetry failure break evaluation.
  }
}

function notificationPayload(transition: Transition) {
  const { rule, from, to, value, at } = transition;
  return {
    alert: rule.name,
    state: to,
    previousState: from,
    severity: rule.severity,
    condition: describeCondition(rule),
    ruleType: rule.ruleType,
    target: rule.target ?? null,
    value,
    threshold: rule.threshold,
    at: at.toISOString(),
    platform: "oblak",
  };
}

async function sendWebhook(
  strapi: Core.Strapi,
  transition: Transition,
): Promise<void> {
  const url = transition.rule.notifyWebhook;
  if (!url) return;

  // A slow or hanging webhook must not stall the evaluation loop.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notificationPayload(transition)),
      signal: controller.signal,
    });
    if (!response.ok) {
      strapi.log.warn(
        `Alert webhook for "${transition.rule.name}" returned ${response.status}`,
      );
    }
  } catch (error) {
    strapi.log.warn(
      `Alert webhook for "${transition.rule.name}" failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmail(
  strapi: Core.Strapi,
  transition: Transition,
): Promise<void> {
  const to = transition.rule.notifyEmail;
  if (!to) return;

  const { rule, value } = transition;
  const firing = transition.to === "firing";
  const subject = firing
    ? `[Oblak ${rule.severity}] ${rule.name}`
    : `[Oblak resolved] ${rule.name}`;

  const lines = [
    firing ? "An Oblak alert is firing." : "An Oblak alert has resolved.",
    "",
    `Rule:      ${rule.name}`,
    `Condition: ${describeCondition(rule)}`,
    `Observed:  ${value === null ? "no data" : value}`,
    `Severity:  ${rule.severity}`,
    `State:     ${transition.from} -> ${transition.to}`,
    `Time:      ${transition.at.toISOString()}`,
  ];
  if (rule.description) lines.push("", rule.description);

  try {
    await strapi
      .plugin("email")
      .service("email")
      .send({
        to,
        subject,
        text: lines.join("\n"),
      });
  } catch (error) {
    // Email is best-effort. SMTP being unconfigured is the common case in a
    // self-hosted install and must not break alerting.
    strapi.log.warn(
      `Alert email for "${rule.name}" failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** Notifies every configured channel for one transition. */
async function notify(
  strapi: Core.Strapi,
  transition: Transition,
): Promise<void> {
  emitTransitionLog(transition);
  // Channels are independent: one failing must not stop the others.
  await Promise.allSettled([
    sendWebhook(strapi, transition),
    sendEmail(strapi, transition),
  ]);
}

// ---------------------------------------------------------------------------
// Persistence and the evaluation loop
// ---------------------------------------------------------------------------

/** Which transitions are worth telling someone about at all. */
function isNotifiableTransition(from: AlertState, to: AlertState): boolean {
  if (from === to) return false;
  // Firing is always news. So is recovering from firing.
  if (to === "firing") return true;
  if (from === "firing" && to === "ok") return true;
  // pending <-> ok churn and anything involving `unknown` stays in the
  // dashboard and the log explorer without paging anyone.
  return false;
}

export type SuppressionReason = "muted" | "cooldown" | null;

/**
 * Decides whether a notifiable transition should actually be sent.
 *
 * Two independent suppressions, both of which keep the state change visible in
 * the dashboard and the log explorer:
 *
 *  - **muted**: the operator has silenced the rule until a point in time.
 *    Deliberate and absolute.
 *  - **cooldown**: the rule changed state again inside its own cooldown. This
 *    is the flap damper: without it a rule oscillating around its threshold
 *    notifies on every crossing.
 *
 * A recovery is never suppressed by cooldown. Telling someone a problem started
 * and then withholding "it stopped" is worse than one extra message.
 */
export function suppressionFor(
  rule: AlertRule,
  to: AlertState,
  now: Date,
): SuppressionReason {
  if (rule.mutedUntil && new Date(rule.mutedUntil).getTime() > now.getTime()) {
    return "muted";
  }

  const cooldownMinutes = rule.notifyCooldownMinutes ?? 0;
  if (cooldownMinutes > 0 && to === "firing" && rule.lastNotifiedAt) {
    const since = now.getTime() - new Date(rule.lastNotifiedAt).getTime();
    if (since < cooldownMinutes * 60_000) {
      return "cooldown";
    }
  }

  return null;
}

/** Evaluates one rule, persists the outcome, and notifies on a transition. */
export async function evaluateAndPersist(
  strapi: Core.Strapi,
  rule: AlertRule,
  now: Date = new Date(),
): Promise<EvaluationResult> {
  const outcome = await evaluateRule(rule, now);
  const previousState = rule.state ?? "ok";
  const changed = previousState !== outcome.state;

  const data: Record<string, unknown> = {
    state: outcome.state,
    lastValue: outcome.value,
    lastError: outcome.error ?? null,
    lastEvaluatedAt: now,
    breachingSince: outcome.breachingSince,
  };
  if (changed) {
    data.stateChangedAt = now;
  }

  const worthNotifying =
    changed && isNotifiableTransition(previousState, outcome.state);
  const suppression = worthNotifying
    ? suppressionFor(rule, outcome.state, now)
    : null;
  const willNotify = worthNotifying && suppression === null;

  if (willNotify) {
    data.lastNotifiedAt = now;
  }

  try {
    await strapi.db.query(UID).update({ where: { id: rule.id }, data });
  } catch (error) {
    strapi.log.error(
      `Could not persist alert state for "${rule.name}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const transition = {
    rule,
    from: previousState,
    to: outcome.state,
    value: outcome.value,
    at: now,
    suppressed: suppression,
  };

  if (willNotify) {
    await notify(strapi, transition);
  } else if (changed) {
    // A suppressed or non-notifiable change still belongs in the telemetry
    // store: the dashboard and the log explorer show it either way.
    emitTransitionLog(transition);
    if (suppression) {
      strapi.log.debug(
        `Alert "${rule.name}" transition to ${outcome.state} suppressed (${suppression})`,
      );
    }
  }

  return {
    ruleId: rule.id,
    name: rule.name,
    previousState,
    state: outcome.state,
    value: outcome.value,
    changed,
    error: outcome.error,
  };
}

/** Evaluates every enabled rule once. */
export async function evaluateAllRules(
  strapi: Core.Strapi,
): Promise<EvaluationResult[]> {
  if (evaluating) {
    strapi.log.debug(
      "Alert evaluation already in progress; skipping this tick",
    );
    return [];
  }
  evaluating = true;

  try {
    const rules: AlertRule[] = await strapi.db.query(UID).findMany({
      where: { enabled: true },
      limit: 500,
    });

    if (!rules.length) return [];

    const now = new Date();
    const results: EvaluationResult[] = [];

    // Sequential rather than parallel: alert evaluation is a background task
    // and should not burst dozens of concurrent queries at the telemetry store
    // while someone is using the dashboard.
    for (const rule of rules) {
      try {
        results.push(await evaluateAndPersist(strapi, rule, now));
      } catch (error) {
        strapi.log.error(
          `Alert rule "${rule.name}" evaluation failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const firing = results.filter((r) => r.state === "firing").length;
    if (firing > 0) {
      strapi.log.debug(
        `Alert evaluation complete: ${firing} firing of ${results.length}`,
      );
    }

    return results;
  } finally {
    evaluating = false;
  }
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

const ALERT_TIMER_SYMBOL = Symbol.for("__oblakAlertEvaluatorTimer__");

/**
 * Starts the periodic evaluator.
 *
 * The timer handle is stored on globalThis so Strapi's dev-mode reload
 * replaces it instead of stacking a new interval on every hot restart.
 */
export function startAlertEvaluator(strapi: Core.Strapi): void {
  if (process.env.ALERTS_ENABLED === "false") {
    strapi.log.info("Alert evaluator disabled by ALERTS_ENABLED=false");
    return;
  }

  const seconds = Math.max(
    15,
    Number(process.env.ALERT_EVAL_INTERVAL_SECONDS || DEFAULT_INTERVAL_SECONDS),
  );

  const globalWithTimer = globalThis as typeof globalThis & {
    [ALERT_TIMER_SYMBOL]?: NodeJS.Timeout;
  };

  if (globalWithTimer[ALERT_TIMER_SYMBOL]) {
    clearInterval(globalWithTimer[ALERT_TIMER_SYMBOL]);
  }

  globalWithTimer[ALERT_TIMER_SYMBOL] = setInterval(() => {
    void evaluateAllRules(strapi).catch((error) => {
      strapi.log.error(
        `Alert evaluation tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, seconds * 1000);

  strapi.log.info(`Alert evaluator running every ${seconds}s`);
}

/**
 * Stops the evaluator.
 *
 * Called from Strapi's destroy hook. Without this, a tick scheduled before
 * shutdown fires against a closing connection pool and logs a spurious
 * "Unable to acquire a connection" error on every restart.
 */
export function stopAlertEvaluator(): void {
  const globalWithTimer = globalThis as typeof globalThis & {
    [ALERT_TIMER_SYMBOL]?: NodeJS.Timeout;
  };

  if (globalWithTimer[ALERT_TIMER_SYMBOL]) {
    clearInterval(globalWithTimer[ALERT_TIMER_SYMBOL]);
    delete globalWithTimer[ALERT_TIMER_SYMBOL];
  }
}
