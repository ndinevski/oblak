/**
 * Alert rule API.
 *
 * CRUD over the rules plus two operations the dashboard needs: evaluating a
 * rule on demand ("test this before I save it") and reading the firing history
 * out of the telemetry store.
 */

import type { Context } from 'koa';
import {
  evaluateAllRules,
  evaluateRule,
  describeCondition,
  type AlertRule,
} from '../../../telemetry/alerting';
import { RULE_TYPES, isRuleType } from '../../../telemetry/alert-queries';
import { getClickHouseClient, ClickHouseError } from '../../../telemetry/clickhouse';
import { recordAuditFromContext } from '../../../telemetry/audit';

const UID = 'api::alert-rule.alert-rule';

/** Fields a client may set. Anything else (state, timestamps) is server-owned. */
const WRITABLE = [
  'name',
  'description',
  'enabled',
  'ruleType',
  'target',
  'comparison',
  'threshold',
  'windowMinutes',
  'forMinutes',
  'severity',
  'notifyWebhook',
  'notifyEmail',
  'notifyCooldownMinutes',
] as const;

interface ValidationIssue {
  field: string;
  message: string;
}

function pickWritable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of WRITABLE) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

/**
 * Validates a rule payload.
 *
 * Done here rather than relying on the content-type schema alone, because the
 * cross-field rules (a target-requiring type must have a target) and the URL
 * check are not expressible there, and a bad rule silently never firing is
 * worse than a rejected save.
 */
function validate(data: Record<string, unknown>, isCreate: boolean): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (isCreate || data.name !== undefined) {
    const name = String(data.name ?? '').trim();
    if (!name) issues.push({ field: 'name', message: 'A name is required' });
    if (name.length > 120) {
      issues.push({ field: 'name', message: 'Name must be 120 characters or fewer' });
    }
  }

  if (isCreate || data.ruleType !== undefined) {
    const ruleType = String(data.ruleType ?? '');
    if (!isRuleType(ruleType)) {
      issues.push({ field: 'ruleType', message: `Unknown rule type: ${ruleType}` });
    } else if (!RULE_TYPES[ruleType].targetOptional) {
      const target = String(data.target ?? '').trim();
      if (!target) {
        issues.push({
          field: 'target',
          message: `${RULE_TYPES[ruleType].label} requires a ${
            RULE_TYPES[ruleType].targetLabel?.toLowerCase() ?? 'target'
          }`,
        });
      }
    }
  }

  if (isCreate || data.threshold !== undefined) {
    const threshold = Number(data.threshold);
    if (!Number.isFinite(threshold)) {
      issues.push({ field: 'threshold', message: 'Threshold must be a number' });
    }
  }

  if (data.comparison !== undefined && !['gt', 'lt'].includes(String(data.comparison))) {
    issues.push({ field: 'comparison', message: 'Comparison must be "gt" or "lt"' });
  }

  if (data.severity !== undefined && !['warning', 'critical'].includes(String(data.severity))) {
    issues.push({ field: 'severity', message: 'Severity must be "warning" or "critical"' });
  }

  for (const [field, max] of [
    ['windowMinutes', 1440],
    ['forMinutes', 1440],
    ['notifyCooldownMinutes', 1440],
  ] as const) {
    if (data[field] === undefined) continue;
    const value = Number(data[field]);
    const min = field === 'windowMinutes' ? 1 : 0;
    if (!Number.isInteger(value) || value < min || value > max) {
      issues.push({ field, message: `${field} must be an integer between ${min} and ${max}` });
    }
  }

  if (data.notifyWebhook) {
    const url = String(data.notifyWebhook);
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        issues.push({ field: 'notifyWebhook', message: 'Webhook must be an http(s) URL' });
      }
    } catch {
      issues.push({ field: 'notifyWebhook', message: 'Webhook must be a valid URL' });
    }
  }

  if (data.notifyEmail) {
    const email = String(data.notifyEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push({ field: 'notifyEmail', message: 'Notification email is not a valid address' });
    }
  }

  return issues;
}

/** Shapes a rule for the API, adding the rendered condition the UI displays. */
function present(rule: AlertRule) {
  return {
    ...rule,
    condition: describeCondition(rule),
    // Derived rather than stored, so it cannot go stale as the mute expires.
    isMuted: Boolean(rule.mutedUntil && new Date(rule.mutedUntil).getTime() > Date.now()),
  };
}

export default {
  /** The rule-type catalogue, so the form is built from the backend contract. */
  async types() {
    return {
      data: Object.entries(RULE_TYPES).map(([value, meta]) => ({ value, ...meta })),
    };
  },

  async find(ctx: Context) {
    const rules: AlertRule[] = await strapi.db.query(UID).findMany({
      orderBy: [{ enabled: 'desc' }, { name: 'asc' }],
      limit: 500,
    });

    // Firing first, then pending: the dashboard leads with what needs attention.
    const weight: Record<string, number> = { firing: 0, pending: 1, unknown: 2, ok: 3 };
    const sorted = [...rules].sort(
      (a, b) => (weight[a.state] ?? 9) - (weight[b.state] ?? 9)
    );

    return {
      data: sorted.map(present),
      meta: {
        total: rules.length,
        firing: rules.filter((r) => r.state === 'firing').length,
        pending: rules.filter((r) => r.state === 'pending').length,
        unknown: rules.filter((r) => r.state === 'unknown').length,
      },
    };
  },

  async findOne(ctx: Context) {
    const rule = await strapi.db.query(UID).findOne({ where: { id: Number(ctx.params.id) } });
    if (!rule) return ctx.notFound('Alert rule not found');
    return { data: present(rule) };
  },

  async create(ctx: Context) {
    const user = ctx.state.user;
    const body = pickWritable((ctx.request.body ?? {}) as Record<string, unknown>);

    const issues = validate(body, true);
    if (issues.length) {
      return ctx.badRequest('Invalid alert rule', { issues });
    }

    const rule = await strapi.db.query(UID).create({
      data: {
        ...body,
        // A new rule starts unknown rather than ok: it has not been evaluated
        // yet, and showing it green would be a lie.
        state: 'unknown',
        owner: user?.id,
      },
    });

    recordAuditFromContext(ctx, {
      action: 'alert.rule.create',
      resourceType: 'telemetry',
      resourceId: rule.id,
      resourceName: rule.name,
      details: { ruleType: rule.ruleType, threshold: rule.threshold, severity: rule.severity },
    });

    ctx.status = 201;
    return { data: present(rule) };
  },

  async update(ctx: Context) {
    const id = Number(ctx.params.id);
    const existing = await strapi.db.query(UID).findOne({ where: { id } });
    if (!existing) return ctx.notFound('Alert rule not found');

    const body = pickWritable((ctx.request.body ?? {}) as Record<string, unknown>);
    const issues = validate({ ...existing, ...body }, false);
    if (issues.length) {
      return ctx.badRequest('Invalid alert rule', { issues });
    }

    // Changing what a rule measures invalidates its current state, so it is
    // reset rather than carried over onto a different condition.
    const conditionChanged = ['ruleType', 'target', 'comparison', 'threshold', 'windowMinutes'].some(
      (key) => body[key] !== undefined && body[key] !== (existing as Record<string, unknown>)[key]
    );

    const rule = await strapi.db.query(UID).update({
      where: { id },
      data: {
        ...body,
        ...(conditionChanged
          ? { state: 'unknown', breachingSince: null, lastValue: null, lastError: null }
          : {}),
      },
    });

    recordAuditFromContext(ctx, {
      action: 'alert.rule.update',
      resourceType: 'telemetry',
      resourceId: rule.id,
      resourceName: rule.name,
      details: { changed: Object.keys(body) },
    });

    return { data: present(rule) };
  },

  async delete(ctx: Context) {
    const id = Number(ctx.params.id);
    const existing = await strapi.db.query(UID).findOne({ where: { id } });
    if (!existing) return ctx.notFound('Alert rule not found');

    await strapi.db.query(UID).delete({ where: { id } });

    recordAuditFromContext(ctx, {
      action: 'alert.rule.delete',
      resourceType: 'telemetry',
      resourceId: id,
      resourceName: existing.name,
    });

    return { data: { id, deleted: true } };
  },

  /**
   * Evaluates a rule immediately without persisting, so the dashboard can show
   * what a threshold would do before it is saved.
   */
  async test(ctx: Context) {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;

    let candidate: AlertRule;
    if (ctx.params.id) {
      const existing = await strapi.db.query(UID).findOne({ where: { id: Number(ctx.params.id) } });
      if (!existing) return ctx.notFound('Alert rule not found');
      candidate = { ...existing, ...pickWritable(body) };
    } else {
      const draft = pickWritable(body);
      const issues = validate(draft, true);
      if (issues.length) return ctx.badRequest('Invalid alert rule', { issues });
      candidate = {
        id: 0,
        name: String(draft.name ?? 'Draft rule'),
        enabled: true,
        state: 'unknown',
        comparison: (draft.comparison as 'gt' | 'lt') ?? 'gt',
        threshold: Number(draft.threshold),
        windowMinutes: Number(draft.windowMinutes ?? 5),
        forMinutes: Number(draft.forMinutes ?? 0),
        severity: (draft.severity as 'warning' | 'critical') ?? 'warning',
        ruleType: String(draft.ruleType),
        target: (draft.target as string) ?? null,
        // Evaluated with no prior breach, so the result reflects the condition
        // right now rather than an inherited pending timer.
        breachingSince: null,
      };
    }

    const result = await evaluateRule(candidate);
    return {
      data: {
        state: result.state,
        value: result.value,
        error: result.error ?? null,
        condition: describeCondition(candidate),
        wouldFire: result.state === 'firing' || result.state === 'pending',
      },
    };
  },

  /**
   * Silences a rule for a period, or lifts an existing silence.
   *
   * Muting is deliberately separate from disabling: a muted rule keeps
   * evaluating and keeps showing its state in the dashboard, it just stops
   * notifying. Disabling stops evaluation entirely.
   */
  async mute(ctx: Context) {
    const id = Number(ctx.params.id);
    const existing = await strapi.db.query(UID).findOne({ where: { id } });
    if (!existing) return ctx.notFound('Alert rule not found');

    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const minutes = body.minutes === undefined ? null : Number(body.minutes);

    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 43200)) {
      return ctx.badRequest('minutes must be between 0 and 43200 (30 days)');
    }

    // A null or zero duration lifts the silence.
    const mutedUntil =
      minutes === null || minutes === 0 ? null : new Date(Date.now() + minutes * 60_000);

    const rule = await strapi.db.query(UID).update({
      where: { id },
      data: { mutedUntil },
    });

    recordAuditFromContext(ctx, {
      action: mutedUntil ? 'alert.rule.mute' : 'alert.rule.unmute',
      resourceType: 'telemetry',
      resourceId: id,
      resourceName: existing.name,
      details: mutedUntil ? { until: mutedUntil.toISOString(), minutes } : {},
    });

    return { data: present(rule) };
  },

  /** Runs the whole evaluation pass now instead of waiting for the timer. */
  async evaluate(ctx: Context) {
    const results = await evaluateAllRules(strapi);
    return {
      data: {
        evaluated: results.length,
        changed: results.filter((r) => r.changed).length,
        firing: results.filter((r) => r.state === 'firing').length,
        results,
      },
    };
  },

  /**
   * Alert state changes, read back out of the telemetry store.
   *
   * History lives there rather than in Postgres so it sits alongside the
   * telemetry that triggered it and expires with the same retention.
   */
  async history(ctx: Context) {
    const ch = getClickHouseClient();
    if (!ch) {
      return ctx.send(
        {
          error: {
            status: 503,
            name: 'TelemetryUnconfigured',
            message: 'Alert history requires the telemetry store.',
          },
        },
        503
      );
    }

    const hours = Math.min(Math.max(Number((ctx.query as any).hours) || 24, 1), 720);
    const limit = Math.min(Math.max(Number((ctx.query as any).limit) || 100, 1), 500);
    const ruleName = typeof (ctx.query as any).rule === 'string' ? (ctx.query as any).rule : '';

    const clauses = [
      `Timestamp >= now() - INTERVAL {hours:UInt32} HOUR`,
      `LogAttributes['oblak.alert.event'] = 'true'`,
    ];
    const params: Record<string, string | number> = { hours };
    if (ruleName) {
      clauses.push(`LogAttributes['oblak.alert.rule'] = {rule:String}`);
      params.rule = ruleName;
    }

    try {
      const result = await ch.query<Record<string, string>>(
        `SELECT
           toUnixTimestamp64Milli(Timestamp)              AS timestampMs,
           LogAttributes['oblak.alert.rule']              AS rule,
           LogAttributes['oblak.alert.state']             AS state,
           LogAttributes['oblak.alert.previous_state']    AS previousState,
           LogAttributes['oblak.alert.severity']          AS severity,
           LogAttributes['oblak.alert.condition']         AS condition,
           LogAttributes['oblak.alert.target']            AS target,
           LogAttributes['oblak.alert.value']             AS value
         FROM otel_logs
         WHERE ${clauses.join(' AND ')}
         ORDER BY Timestamp DESC
         LIMIT ${limit}`,
        params
      );

      return {
        data: result.data.map((row) => ({
          ...row,
          timestampMs: Number(row.timestampMs),
          value: row.value === '' ? null : Number(row.value),
        })),
      };
    } catch (error) {
      if (error instanceof ClickHouseError) {
        return ctx.send(
          {
            error: { status: 502, name: 'TelemetryQueryError', message: error.message },
          },
          502
        );
      }
      throw error;
    }
  },
};
