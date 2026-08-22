/**
 * Tests for the telemetry SQL layer.
 *
 * These assert on the SQL and bound parameters the query functions produce,
 * rather than on a live ClickHouse. The properties that matter are: user input
 * is always bound rather than interpolated, every query is time-bounded, and
 * page sizes are capped so one request cannot scan all of retention.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClickHouseClient } from '../../src/telemetry/clickhouse';
import * as q from '../../src/telemetry/queries';

interface Captured {
  sql: string;
  params: Record<string, unknown>;
}

/**
 * A stand-in client that records what it was asked to run and returns an empty
 * result set.
 */
function mockClient(rows: unknown[] = []) {
  const calls: Captured[] = [];
  const client = {
    database: 'otel',
    query: vi.fn(async (sql: string, params: Record<string, unknown> = {}) => {
      calls.push({ sql, params });
      return { data: rows, rows: rows.length };
    }),
    health: vi.fn(),
  } as unknown as ClickHouseClient;
  return { client, calls };
}

const RANGE = {
  from: new Date('2026-08-22T10:00:00Z'),
  to: new Date('2026-08-22T11:00:00Z'),
};

/** All bound parameter values across every query the call produced. */
function allParamValues(calls: Captured[]): unknown[] {
  return calls.flatMap((c) => Object.values(c.params));
}

describe('searchLogs', () => {
  it('always bounds the query by time', async () => {
    const { client, calls } = mockClient();
    await q.searchLogs(client, { ...RANGE });

    expect(calls[0].sql).toContain('Timestamp >=');
    expect(calls[0].sql).toContain('Timestamp <=');
    expect(allParamValues(calls)).toContain(RANGE.from);
  });

  it('binds the search term instead of inlining it', async () => {
    const hostile = "') OR 1=1 --";
    const { client, calls } = mockClient();
    await q.searchLogs(client, { ...RANGE, search: hostile });

    expect(calls[0].sql).not.toContain('OR 1=1');
    expect(allParamValues(calls)).toContain(hostile);
  });

  it('binds attribute keys as well as values', async () => {
    const { client, calls } = mockClient();
    await q.searchLogs(client, {
      ...RANGE,
      attributes: { "evil']='x": 'v' },
    });

    // The key is attacker-influenced too, so it must not reach the SQL text.
    expect(calls[0].sql).not.toContain("evil']");
    expect(allParamValues(calls)).toContain("evil']='x");
    expect(allParamValues(calls)).toContain('v');
  });

  it('caps the page size so a client cannot request unbounded rows', async () => {
    const { client, calls } = mockClient();
    await q.searchLogs(client, { ...RANGE, limit: 999999 });

    expect(calls[0].sql).toMatch(/LIMIT 1000\b/);
  });

  it('falls back to a default limit for a nonsensical value', async () => {
    const { client, calls } = mockClient();
    await q.searchLogs(client, { ...RANGE, limit: -5 });

    expect(calls[0].sql).toMatch(/LIMIT 100\b/);
  });

  it('never emits a negative offset', async () => {
    const { client, calls } = mockClient();
    await q.searchLogs(client, { ...RANGE, offset: -20 });

    expect(calls[0].sql).toMatch(/OFFSET 0\b/);
  });

  it('scopes to a single user when a userId is supplied', async () => {
    const { client, calls } = mockClient();
    await q.searchLogs(client, { ...RANGE, auditOnly: true, userId: '7' });

    // The audit endpoint passes the authenticated caller's id here; without
    // the clause a signed-in user would read everyone's audit trail.
    expect(calls[0].sql).toContain("LogAttributes['oblak.audit.user_id']");
    expect(allParamValues(calls)).toContain('7');
  });

  it('filters to audit records when asked', async () => {
    const { client, calls } = mockClient();
    await q.searchLogs(client, { ...RANGE, auditOnly: true });

    expect(calls[0].sql).toContain("LogAttributes['oblak.audit.event'] = 'true'");
  });

  it('omits optional filters that were not supplied', async () => {
    const { client, calls } = mockClient();
    await q.searchLogs(client, { ...RANGE });

    expect(calls[0].sql).not.toContain('ServiceName IN');
    expect(calls[0].sql).not.toContain('SeverityNumber >=');
    expect(calls[0].sql).not.toContain('TraceId =');
  });

  it('binds a service list as an array parameter', async () => {
    const { client, calls } = mockClient();
    await q.searchLogs(client, { ...RANGE, services: ['impuls', 'spomen'] });

    expect(calls[0].sql).toContain('ServiceName IN');
    expect(allParamValues(calls)).toContainEqual(['impuls', 'spomen']);
  });

  it('returns the row count from the companion count query', async () => {
    const calls: Captured[] = [];
    const client = {
      database: 'otel',
      query: vi.fn(async (sql: string, params: Record<string, unknown> = {}) => {
        calls.push({ sql, params });
        // The count query is the one selecting count().
        if (sql.includes('count() AS total')) {
          return { data: [{ total: '4321' }], rows: 1 };
        }
        return { data: [{ body: 'hello' }], rows: 1 };
      }),
    } as unknown as ClickHouseClient;

    const result = await q.searchLogs(client, { ...RANGE });
    expect(result.total).toBe(4321);
  });
});

describe('logHistogram', () => {
  it('derives a bucket width from the window so bucket count stays bounded', async () => {
    const { client, calls } = mockClient();
    await q.logHistogram(client, { ...RANGE }, 60);

    // One hour across 60 buckets is 60 seconds each.
    expect(calls[0].params.step).toBe(60);
  });

  it('never produces a zero-second bucket for a tiny window', async () => {
    const { client, calls } = mockClient();
    const to = new Date('2026-08-22T10:00:10Z');
    await q.logHistogram(client, { from: new Date('2026-08-22T10:00:00Z'), to }, 60);

    // 10s over 60 buckets rounds to 0, which ClickHouse would reject.
    expect(calls[0].params.step).toBeGreaterThanOrEqual(1);
  });
});

describe('listTraces', () => {
  it('returns only root spans so the list has one row per trace', async () => {
    const { client, calls } = mockClient();
    await q.listTraces(client, { ...RANGE });

    expect(calls[0].sql).toContain("ParentSpanId = ''");
  });

  it('converts a millisecond duration filter to nanoseconds', async () => {
    const { client, calls } = mockClient();
    await q.listTraces(client, { ...RANGE, minDurationMs: 250 });

    // Duration is stored in nanoseconds.
    expect(allParamValues(calls)).toContain(250 * 1e6);
  });

  it('filters to errors when requested', async () => {
    const { client, calls } = mockClient();
    await q.listTraces(client, { ...RANGE, errorsOnly: true });

    expect(calls[0].sql).toContain("StatusCode = 'Error'");
  });
});

describe('getTrace', () => {
  it('binds the trace id', async () => {
    const { client, calls } = mockClient();
    await q.getTrace(client, 'abc123');

    expect(calls[0].params.traceId).toBe('abc123');
    expect(calls[0].sql).not.toContain('abc123');
  });
});

describe('queryMetric', () => {
  it('differences counters rather than averaging their cumulative value', async () => {
    const { client, calls } = mockClient();
    await q.queryMetric(client, { ...RANGE, name: 'http.server.request.count', type: 'sum' });

    // A cumulative counter averaged per bucket would show a meaningless ramp.
    expect(calls[0].sql).toContain('lagInFrame');
    expect(calls[0].sql).toContain('otel_metrics_sum');
  });

  it('shows non-monotonic sums as their value, not a delta', async () => {
    const { client, calls } = mockClient();
    await q.queryMetric(client, { ...RANGE, name: 'postgresql.backends', type: 'sum' });

    // The sum table mixes cumulative counters with current-value gauges.
    // Differencing a connection count would report ~0 instead of the reading,
    // so the query branches on IsMonotonic rather than always differencing.
    expect(calls[0].sql).toContain('IsMonotonic');
    expect(calls[0].sql).toContain('if(');
  });

  it('averages gauges within a bucket', async () => {
    const { client, calls } = mockClient();
    await q.queryMetric(client, { ...RANGE, name: 'system.cpu.utilization', type: 'gauge' });

    expect(calls[0].sql).toContain('avg(Value)');
    expect(calls[0].sql).toContain('otel_metrics_gauge');
  });

  it('uses count and sum for histograms', async () => {
    const { client, calls } = mockClient();
    await q.queryMetric(client, { ...RANGE, name: 'http.server.request.duration', type: 'histogram' });

    expect(calls[0].sql).toContain('otel_metrics_histogram');
    expect(calls[0].sql).toContain('sum(Count)');
  });

  it('binds an unknown metric type to the gauge table rather than the raw string', async () => {
    const { client, calls } = mockClient();
    // The type comes from a query parameter, so it must never be interpolated.
    await q.queryMetric(client, { ...RANGE, name: 'x', type: 'otel_logs; DROP TABLE otel_logs' });

    expect(calls[0].sql).toContain('otel_metrics_gauge');
    expect(calls[0].sql).not.toContain('DROP TABLE');
  });

  it('binds the group-by attribute key', async () => {
    const { client, calls } = mockClient();
    await q.queryMetric(client, {
      ...RANGE,
      name: 'http.server.request.count',
      type: 'sum',
      groupBy: 'http.route',
    });

    expect(calls[0].params.groupKey).toBe('http.route');
  });
});

describe('countAuditAction', () => {
  it('scopes the count to the action, user and window', async () => {
    const { client, calls } = mockClient([{ total: '12' }]);
    const result = await q.countAuditAction(client, RANGE, 'function.invoke', 7);

    expect(result).toBe(12);
    expect(allParamValues(calls)).toContain('function.invoke');
    expect(allParamValues(calls)).toContain('7');
  });

  it('omits the user filter when no user is given', async () => {
    const { client, calls } = mockClient([{ total: '3' }]);
    await q.countAuditAction(client, RANGE, 'function.invoke', null);

    expect(calls[0].sql).not.toContain('user_id');
  });

  it('returns zero when the store has no matching rows', async () => {
    const { client } = mockClient([]);
    expect(await q.countAuditAction(client, RANGE, 'function.invoke')).toBe(0);
  });
});

describe('functionInvocationLogs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('matches any of the supplied resource ids', async () => {
    const { client, calls } = mockClient();
    await q.functionInvocationLogs(client, RANGE, { resourceIds: ['3', 'doc-abc'], userId: 1 });

    expect(calls[0].sql).toContain("LogAttributes['oblak.audit.resource_id'] IN");
    expect(allParamValues(calls)).toContainEqual(['3', 'doc-abc']);
  });

  it('caps the number of rows returned', async () => {
    const { client, calls } = mockClient();
    await q.functionInvocationLogs(client, RANGE, { resourceIds: ['1'], limit: 100000 });

    expect(calls[0].sql).toMatch(/LIMIT 500\b/);
  });

  it('extracts detail attributes and drops the audit prefix', async () => {
    const { client } = mockClient([
      {
        timestampMs: 1000,
        status: 'success',
        durationRaw: '42',
        traceId: 'abc',
        errorMessage: '',
        attributes: {
          'oblak.audit.action': 'function.invoke',
          'oblak.audit.detail.statusCode': '200',
        },
      },
    ]);

    const [entry] = await q.functionInvocationLogs(client, RANGE, { resourceIds: ['1'] });
    expect(entry.durationMs).toBe(42);
    expect(entry.details).toEqual({ statusCode: '200' });
    expect(entry.errorMessage).toBeNull();
  });
});

describe('serviceMap', () => {
  it('only reports edges that cross a service boundary', async () => {
    const { client, calls } = mockClient();
    await q.serviceMap(client, RANGE);

    expect(calls[0].sql).toContain('parent.ServiceName != child.ServiceName');
  });

  it('bounds both sides of the join by time', async () => {
    const { client, calls } = mockClient();
    await q.serviceMap(client, RANGE);

    // Without a bound on the parent side the join would scan all retention.
    expect(calls[0].sql).toContain('parent.Timestamp >=');
    expect(calls[0].sql).toContain('child.Timestamp >=');
  });
});
