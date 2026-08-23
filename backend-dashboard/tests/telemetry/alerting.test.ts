/**
 * Tests for alert evaluation.
 *
 * The properties that matter are the ones that decide whether someone gets
 * woken up: a failing query must never read as a breach, an empty window must
 * never read as healthy, the sustained-duration timer must actually hold a
 * rule back, and notifications must fire on transitions rather than on every
 * evaluation cycle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const emit = vi.fn();
vi.mock('@opentelemetry/api-logs', () => ({
  logs: { getLogger: () => ({ emit }) },
  SeverityNumber: { DEBUG: 5, INFO: 9, ERROR: 17, FATAL: 21 },
}));

const mockClient = { query: vi.fn(), database: 'otel', health: vi.fn() };
let clientAvailable = true;
vi.mock('../../src/telemetry/clickhouse', () => ({
  getClickHouseClient: () => (clientAvailable ? mockClient : null),
  ClickHouseError: class extends Error {},
}));

const evaluateRuleType = vi.fn();
vi.mock('../../src/telemetry/alert-queries', async () => {
  const actual = await vi.importActual<typeof import('../../src/telemetry/alert-queries')>(
    '../../src/telemetry/alert-queries'
  );
  return { ...actual, evaluateRuleType: (...args: unknown[]) => evaluateRuleType(...args) };
});

import {
  evaluateRule,
  describeCondition,
  suppressionFor,
  type AlertRule,
} from '../../src/telemetry/alerting';

const NOW = new Date('2026-08-22T12:00:00Z');

function rule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 1,
    name: 'Test rule',
    enabled: true,
    ruleType: 'service.error_rate',
    target: 'impuls',
    comparison: 'gt',
    threshold: 5,
    windowMinutes: 5,
    forMinutes: 0,
    severity: 'warning',
    state: 'ok',
    ...overrides,
  };
}

beforeEach(() => {
  emit.mockClear();
  evaluateRuleType.mockReset();
  clientAvailable = true;
});

describe('evaluateRule - breach detection', () => {
  it('reports ok when the value is under an "above" threshold', async () => {
    evaluateRuleType.mockResolvedValue(2);
    const result = await evaluateRule(rule({ comparison: 'gt', threshold: 5 }), NOW);

    expect(result.state).toBe('ok');
    expect(result.value).toBe(2);
  });

  it('fires when the value exceeds an "above" threshold', async () => {
    evaluateRuleType.mockResolvedValue(9);
    const result = await evaluateRule(rule({ comparison: 'gt', threshold: 5 }), NOW);

    expect(result.state).toBe('firing');
  });

  it('treats the threshold itself as not breaching', async () => {
    evaluateRuleType.mockResolvedValue(5);
    // Strictly greater than, so exactly-at-threshold is healthy.
    expect((await evaluateRule(rule({ comparison: 'gt', threshold: 5 }), NOW)).state).toBe('ok');
  });

  it('fires when the value falls under a "below" threshold', async () => {
    evaluateRuleType.mockResolvedValue(0);
    const result = await evaluateRule(
      rule({ ruleType: 'service.absent', comparison: 'lt', threshold: 1 }),
      NOW
    );

    expect(result.state).toBe('firing');
  });

  it('does not fire a "below" rule when the value is at or above the threshold', async () => {
    evaluateRuleType.mockResolvedValue(3);
    const result = await evaluateRule(
      rule({ ruleType: 'service.absent', comparison: 'lt', threshold: 1 }),
      NOW
    );

    expect(result.state).toBe('ok');
  });
});

describe('evaluateRule - sustained duration', () => {
  it('stays pending while the breach is younger than forMinutes', async () => {
    evaluateRuleType.mockResolvedValue(50);
    const breachingSince = new Date(NOW.getTime() - 2 * 60_000).toISOString();

    const result = await evaluateRule(rule({ forMinutes: 5, breachingSince }), NOW);

    // Two minutes into a five-minute requirement.
    expect(result.state).toBe('pending');
  });

  it('fires once the breach has lasted forMinutes', async () => {
    evaluateRuleType.mockResolvedValue(50);
    const breachingSince = new Date(NOW.getTime() - 5 * 60_000).toISOString();

    const result = await evaluateRule(rule({ forMinutes: 5, breachingSince }), NOW);
    expect(result.state).toBe('firing');
  });

  it('starts the breach clock on the first breaching evaluation', async () => {
    evaluateRuleType.mockResolvedValue(50);
    const result = await evaluateRule(rule({ forMinutes: 5, breachingSince: null }), NOW);

    expect(result.state).toBe('pending');
    expect(result.breachingSince?.toISOString()).toBe(NOW.toISOString());
  });

  it('fires immediately when forMinutes is zero', async () => {
    evaluateRuleType.mockResolvedValue(50);
    const result = await evaluateRule(rule({ forMinutes: 0, breachingSince: null }), NOW);

    expect(result.state).toBe('firing');
  });

  it('clears the breach clock when the value recovers', async () => {
    evaluateRuleType.mockResolvedValue(1);
    const breachingSince = new Date(NOW.getTime() - 10 * 60_000).toISOString();

    const result = await evaluateRule(rule({ forMinutes: 5, breachingSince }), NOW);

    expect(result.state).toBe('ok');
    // A later breach must start its timer afresh rather than inheriting this one.
    expect(result.breachingSince).toBeNull();
  });
});

describe('evaluateRule - failure handling', () => {
  it('goes to unknown, never firing, when the query throws', async () => {
    evaluateRuleType.mockRejectedValue(new Error('ClickHouse unreachable'));

    const result = await evaluateRule(rule(), NOW);

    // An unreachable telemetry store must not page anyone.
    expect(result.state).toBe('unknown');
    expect(result.error).toContain('ClickHouse unreachable');
  });

  it('goes to unknown when telemetry storage is not configured', async () => {
    clientAvailable = false;

    const result = await evaluateRule(rule(), NOW);

    expect(result.state).toBe('unknown');
    expect(result.error).toMatch(/not configured/i);
  });

  it('goes to unknown for an unrecognised rule type', async () => {
    const result = await evaluateRule(rule({ ruleType: 'nonsense.type' }), NOW);

    expect(result.state).toBe('unknown');
    expect(result.error).toContain('nonsense.type');
    // The query must not even be attempted.
    expect(evaluateRuleType).not.toHaveBeenCalled();
  });

  it('treats an empty window as unknown rather than healthy', async () => {
    evaluateRuleType.mockResolvedValue(null);

    const result = await evaluateRule(rule(), NOW);

    // Reporting "ok" for a silent service would be a lie.
    expect(result.state).toBe('unknown');
    expect(result.error).toMatch(/no data/i);
  });
});

describe('evaluateRule - window', () => {
  it('passes a window derived from windowMinutes', async () => {
    evaluateRuleType.mockResolvedValue(1);
    await evaluateRule(rule({ windowMinutes: 15 }), NOW);

    const ctx = evaluateRuleType.mock.calls[0][1] as { from: Date; to: Date };
    expect(ctx.to.toISOString()).toBe(NOW.toISOString());
    expect(NOW.getTime() - ctx.from.getTime()).toBe(15 * 60_000);
  });

  it('forwards the target to the query', async () => {
    evaluateRuleType.mockResolvedValue(1);
    await evaluateRule(rule({ target: 'spomen' }), NOW);

    const ctx = evaluateRuleType.mock.calls[0][1] as { target: string };
    expect(ctx.target).toBe('spomen');
  });

  it('never uses a zero-length window', async () => {
    evaluateRuleType.mockResolvedValue(1);
    await evaluateRule(rule({ windowMinutes: 0 }), NOW);

    const ctx = evaluateRuleType.mock.calls[0][1] as { from: Date; to: Date };
    expect(ctx.to.getTime()).toBeGreaterThan(ctx.from.getTime());
  });
});

describe('describeCondition', () => {
  it('renders an above-threshold rule with its unit and target', () => {
    expect(
      describeCondition(
        rule({ ruleType: 'service.error_rate', target: 'impuls', comparison: 'gt', threshold: 5 })
      )
    ).toBe('Service error rate for impuls above 5 % over 5m');
  });

  it('renders a below-threshold rule', () => {
    expect(
      describeCondition(
        rule({
          ruleType: 'service.absent',
          target: 'izvor',
          comparison: 'lt',
          threshold: 1,
          windowMinutes: 10,
        })
      )
    ).toBe('Service not reporting for izvor below 1 datapoints over 10m');
  });

  it('omits the target when the rule applies to everything', () => {
    const text = describeCondition(
      rule({ ruleType: 'host.cpu', target: null, comparison: 'gt', threshold: 80 })
    );
    expect(text).toBe('Host CPU usage above 80 % over 5m');
    expect(text).not.toContain('for');
  });

  it('falls back to the raw type for an unknown rule type', () => {
    expect(describeCondition(rule({ ruleType: 'custom.thing', target: null }))).toContain(
      'custom.thing'
    );
  });
});


describe('suppressionFor', () => {
  it('does not suppress a rule with no mute and no cooldown', () => {
    expect(suppressionFor(rule(), 'firing', NOW)).toBeNull();
  });

  it('suppresses while the rule is muted', () => {
    const mutedUntil = new Date(NOW.getTime() + 30 * 60_000).toISOString();
    expect(suppressionFor(rule({ mutedUntil }), 'firing', NOW)).toBe('muted');
  });

  it('suppresses a recovery too while muted', () => {
    // Muting is deliberate and absolute: the operator asked for silence.
    const mutedUntil = new Date(NOW.getTime() + 30 * 60_000).toISOString();
    expect(suppressionFor(rule({ mutedUntil }), 'ok', NOW)).toBe('muted');
  });

  it('stops suppressing once the mute has expired', () => {
    const mutedUntil = new Date(NOW.getTime() - 60_000).toISOString();
    expect(suppressionFor(rule({ mutedUntil }), 'firing', NOW)).toBeNull();
  });

  it('suppresses a repeat firing inside the cooldown', () => {
    const lastNotifiedAt = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    // Five minutes into a thirty minute cooldown.
    expect(
      suppressionFor(rule({ notifyCooldownMinutes: 30, lastNotifiedAt }), 'firing', NOW)
    ).toBe('cooldown');
  });

  it('allows a firing notification once the cooldown has elapsed', () => {
    const lastNotifiedAt = new Date(NOW.getTime() - 31 * 60_000).toISOString();
    expect(
      suppressionFor(rule({ notifyCooldownMinutes: 30, lastNotifiedAt }), 'firing', NOW)
    ).toBeNull();
  });

  it('never holds back a recovery on cooldown alone', () => {
    // Saying a problem started and then withholding "it stopped" is worse
    // than one extra message.
    const lastNotifiedAt = new Date(NOW.getTime() - 60_000).toISOString();
    expect(
      suppressionFor(rule({ notifyCooldownMinutes: 30, lastNotifiedAt }), 'ok', NOW)
    ).toBeNull();
  });

  it('does not apply a cooldown to a rule that has never notified', () => {
    expect(
      suppressionFor(rule({ notifyCooldownMinutes: 30, lastNotifiedAt: null }), 'firing', NOW)
    ).toBeNull();
  });

  it('treats a zero cooldown as no cooldown', () => {
    const lastNotifiedAt = new Date(NOW.getTime() - 1000).toISOString();
    expect(
      suppressionFor(rule({ notifyCooldownMinutes: 0, lastNotifiedAt }), 'firing', NOW)
    ).toBeNull();
  });

  it('prefers muted over cooldown when both apply', () => {
    const mutedUntil = new Date(NOW.getTime() + 30 * 60_000).toISOString();
    const lastNotifiedAt = new Date(NOW.getTime() - 60_000).toISOString();
    expect(
      suppressionFor(rule({ mutedUntil, notifyCooldownMinutes: 30, lastNotifiedAt }), 'firing', NOW)
    ).toBe('muted');
  });
});
