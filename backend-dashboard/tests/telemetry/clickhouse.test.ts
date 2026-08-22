/**
 * Tests for the ClickHouse client used by the telemetry API.
 *
 * The critical properties are that user-supplied values always travel as bound
 * parameters (never concatenated into SQL), that queries are forced read-only,
 * and that a telemetry outage surfaces as a typed error the API can turn into
 * a clean 503 rather than a stack trace.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ClickHouseClient,
  ClickHouseError,
  getClickHouseClient,
  resetClickHouseClient,
} from '../../src/telemetry/clickhouse';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function makeClient() {
  return new ClickHouseClient({
    url: 'http://clickhouse:8123',
    database: 'otel',
    username: 'oblak',
    password: 'secret',
  });
}

/** Parses the URL the client fetched, for asserting on query parameters. */
function fetchedUrl(fetchMock: ReturnType<typeof vi.fn>): URL {
  return new URL(fetchMock.mock.calls[0][0] as string);
}

describe('ClickHouseClient.query', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ n: 1 }], rows: 1 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the SQL as the request body and returns typed rows', async () => {
    const result = await makeClient().query<{ n: number }>('SELECT 1 AS n');

    expect(fetchMock.mock.calls[0][1].body).toBe('SELECT 1 AS n');
    expect(result.data).toEqual([{ n: 1 }]);
    expect(result.rows).toBe(1);
  });

  it('forces read-only mode so no query can mutate the store', async () => {
    await makeClient().query('SELECT 1');
    expect(fetchedUrl(fetchMock).searchParams.get('readonly')).toBe('2');
  });

  it('scopes queries to the configured database', async () => {
    await makeClient().query('SELECT 1');
    expect(fetchedUrl(fetchMock).searchParams.get('database')).toBe('otel');
  });

  it('authenticates via headers rather than the URL', async () => {
    await makeClient().query('SELECT 1');
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['X-ClickHouse-User']).toBe('oblak');
    expect(headers['X-ClickHouse-Key']).toBe('secret');
    // Credentials in a query string would leak into server access logs.
    expect(fetchedUrl(fetchMock).searchParams.get('password')).toBeNull();
  });

  it('passes values as bound params, never inlined into the SQL', async () => {
    // A value crafted to break out of a string literal must stay inert.
    const hostile = "'; DROP TABLE otel_logs; --";
    await makeClient().query('SELECT * FROM otel_logs WHERE Body = {q:String}', { q: hostile });

    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).not.toContain('DROP TABLE');
    expect(fetchedUrl(fetchMock).searchParams.get('param_q')).toBe(hostile);
  });

  it('formats dates in a timezone-unambiguous form ClickHouse accepts', async () => {
    await makeClient().query('SELECT 1', { t: new Date('2026-08-22T12:34:56.789Z') });
    expect(fetchedUrl(fetchMock).searchParams.get('param_t')).toBe('2026-08-22 12:34:56.789');
  });

  it('formats string arrays as ClickHouse array literals', async () => {
    await makeClient().query('SELECT 1', { s: ['impuls', 'spomen'] });
    expect(fetchedUrl(fetchMock).searchParams.get('param_s')).toBe("['impuls','spomen']");
  });

  it('escapes quotes inside array values', async () => {
    await makeClient().query('SELECT 1', { s: ["it's"] });
    expect(fetchedUrl(fetchMock).searchParams.get('param_s')).toBe("['it\\'s']");
  });

  it('formats numeric arrays without quoting', async () => {
    await makeClient().query('SELECT 1', { n: [1, 2, 3] });
    expect(fetchedUrl(fetchMock).searchParams.get('param_n')).toBe('[1,2,3]');
  });

  it('turns a server error into a typed ClickHouseError', async () => {
    fetchMock.mockResolvedValue(new Response('Code: 47. Unknown identifier', { status: 400 }));

    await expect(makeClient().query('SELECT bogus')).rejects.toBeInstanceOf(ClickHouseError);
  });

  it('reports an unreachable store as a 503 so the API can degrade', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(makeClient().query('SELECT 1')).rejects.toMatchObject({
      name: 'ClickHouseError',
      status: 503,
    });
  });

  it('treats malformed JSON as a bad-gateway rather than crashing', async () => {
    fetchMock.mockResolvedValue(new Response('not json at all', { status: 200 }));

    await expect(makeClient().query('SELECT 1')).rejects.toMatchObject({ status: 502 });
  });

  it('handles an empty response body', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    const result = await makeClient().query('SELECT 1');
    expect(result).toEqual({ data: [], rows: 0 });
  });
});

describe('ClickHouseClient.health', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports reachable with the table list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ data: [{ name: 'otel_logs' }, { name: 'otel_traces' }], rows: 2 })
      )
    );

    const health = await makeClient().health();
    expect(health.reachable).toBe(true);
    expect(health.tables).toEqual(['otel_logs', 'otel_traces']);
  });

  it('reports unreachable instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

    const health = await makeClient().health();
    expect(health.reachable).toBe(false);
    expect(health.error).toBeTruthy();
  });
});

describe('getClickHouseClient', () => {
  const originalUrl = process.env.CLICKHOUSE_URL;

  beforeEach(() => resetClickHouseClient());

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.CLICKHOUSE_URL;
    } else {
      process.env.CLICKHOUSE_URL = originalUrl;
    }
    resetClickHouseClient();
  });

  it('returns null when telemetry storage is not configured', () => {
    delete process.env.CLICKHOUSE_URL;
    // Callers must be able to degrade rather than crash at import time.
    expect(getClickHouseClient()).toBeNull();
  });

  it('returns a shared instance once configured', () => {
    process.env.CLICKHOUSE_URL = 'http://clickhouse:8123';
    const first = getClickHouseClient();
    expect(first).not.toBeNull();
    expect(getClickHouseClient()).toBe(first);
  });
});
