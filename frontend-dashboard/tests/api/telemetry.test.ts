/**
 * Tests for the telemetry API client and its presentation helpers.
 *
 * The query-building behaviour matters most: attribute filters travel under an
 * `attr.` prefix, arrays are comma-joined, and empty values are dropped rather
 * than sent as blanks that the API would treat as real filters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn() },
  API_CONFIG: {
    baseURL: 'http://localhost:1337/api',
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  },
}));

import {
  telemetryApi,
  formatBytes,
  formatCount,
  formatDuration,
  seriesColor,
  severityBadgeClass,
  severityColor,
} from '@/lib/api/telemetry';

const mockGet = vi.mocked(apiClient.get);

/** The URL the client requested. */
function requestedUrl(): string {
  return mockGet.mock.calls[0][0] as string;
}

function query(): URLSearchParams {
  return new URLSearchParams(requestedUrl().split('?')[1] ?? '');
}

describe('telemetryApi request building', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: [] } } as never);
  });

  it('unwraps the Strapi data envelope', async () => {
    mockGet.mockResolvedValue({ data: { data: [{ service: 'impuls' }] } } as never);

    const result = await telemetryApi.services({ range: '1h' });
    expect(result).toEqual([{ service: 'impuls' }]);
  });

  it('sends a relative range as a single parameter', async () => {
    await telemetryApi.summary({ range: '24h' });
    expect(query().get('range')).toBe('24h');
  });

  it('comma-joins array filters', async () => {
    await telemetryApi.logs({ range: '1h', services: ['impuls', 'spomen'] });
    expect(query().get('services')).toBe('impuls,spomen');
  });

  it('omits empty arrays rather than sending a blank parameter', async () => {
    await telemetryApi.logs({ range: '1h', services: [] });
    expect(query().has('services')).toBe(false);
  });

  it('prefixes attribute filters so they cannot collide with real parameters', async () => {
    await telemetryApi.logs({
      range: '1h',
      attributes: { 'http.route': '/health', 'service.name': 'impuls' },
    });

    const q = query();
    expect(q.get('attr.http.route')).toBe('/health');
    expect(q.get('attr.service.name')).toBe('impuls');
    // The raw key must not leak through as its own parameter.
    expect(q.has('http.route')).toBe(false);
  });

  it('drops empty attribute values', async () => {
    await telemetryApi.logs({ range: '1h', attributes: { 'http.route': '' } });
    expect(query().has('attr.http.route')).toBe(false);
  });

  it('drops undefined and empty-string parameters', async () => {
    await telemetryApi.logs({ range: '1h', search: '', traceId: undefined });

    const q = query();
    expect(q.has('search')).toBe(false);
    expect(q.has('traceId')).toBe(false);
  });

  it('sends zero as a real value rather than dropping it', async () => {
    await telemetryApi.logs({ range: '1h', offset: 0 });
    // Offset 0 is the first page, not "unset".
    expect(query().get('offset')).toBe('0');
  });

  it('url-encodes a field key in the path', async () => {
    await telemetryApi.logFieldValues('http.response.status_code', { range: '1h' });
    expect(requestedUrl()).toContain('/logs/fields/http.response.status_code/values');
  });

  it('requests a trace by id', async () => {
    mockGet.mockResolvedValue({ data: { data: { traceId: 'abc', spans: [] } } } as never);
    await telemetryApi.trace('abc123');
    expect(requestedUrl()).toContain('/telemetry/traces/abc123');
  });
});

describe('formatDuration', () => {
  it('uses microseconds below a millisecond', () => {
    expect(formatDuration(0.25)).toBe('250µs');
  });

  it('keeps two decimals for small millisecond values', () => {
    expect(formatDuration(4.567)).toBe('4.57ms');
  });

  it('rounds larger millisecond values', () => {
    expect(formatDuration(250.4)).toBe('250ms');
  });

  it('switches to seconds past a second', () => {
    expect(formatDuration(1500)).toBe('1.50s');
  });

  it('switches to minutes past a minute', () => {
    expect(formatDuration(90_000)).toBe('1.5m');
  });

  it('renders a dash for missing values rather than NaN', () => {
    expect(formatDuration(null)).toBe('-');
    expect(formatDuration(undefined)).toBe('-');
    expect(formatDuration(Number.NaN)).toBe('-');
  });
});

describe('formatCount', () => {
  it('leaves small numbers alone', () => {
    expect(formatCount(999)).toBe('999');
  });

  it('compacts thousands and millions', () => {
    expect(formatCount(1500)).toBe('1.5k');
    expect(formatCount(2_500_000)).toBe('2.5M');
  });

  it('renders a dash for missing values', () => {
    expect(formatCount(null)).toBe('-');
  });

  it('renders zero as zero, not a dash', () => {
    expect(formatCount(0)).toBe('0');
  });
});

describe('formatBytes', () => {
  it('scales through the unit ladder', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('handles zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });
});

describe('severity presentation', () => {
  it('maps error severities to the reserved critical status colour', () => {
    expect(severityColor('ERROR')).toBe('var(--status-critical)');
    expect(severityColor('FATAL')).toBe('var(--status-critical)');
  });

  it('maps warnings to the warning status colour', () => {
    expect(severityColor('WARN')).toBe('var(--status-warning)');
  });

  it('is case-insensitive', () => {
    expect(severityColor('error')).toBe(severityColor('ERROR'));
  });

  it('falls back for an unknown severity rather than throwing', () => {
    expect(severityColor('SOMETHING_ELSE')).toBe('var(--chart-axis)');
  });

  it('gives every severity a badge class carrying visible text styling', () => {
    // Severity must never rest on colour alone; the badge always has text.
    for (const level of ['ERROR', 'WARN', 'INFO', 'DEBUG']) {
      expect(severityBadgeClass(level)).toBeTruthy();
    }
  });
});

describe('seriesColor', () => {
  it('assigns colours by sorted position so they follow the entity', () => {
    const names = ['spomen', 'impuls', 'izvor'];
    // Sorted order is impuls, izvor, spomen.
    expect(seriesColor('impuls', names)).toBe('var(--chart-1)');
    expect(seriesColor('izvor', names)).toBe('var(--chart-2)');
    expect(seriesColor('spomen', names)).toBe('var(--chart-3)');
  });

  it('keeps a service on its colour when the input order changes', () => {
    const a = seriesColor('izvor', ['spomen', 'impuls', 'izvor']);
    const b = seriesColor('izvor', ['izvor', 'impuls', 'spomen']);
    expect(a).toBe(b);
  });

  it('repaints when the series set changes, but never by rank', () => {
    // Dropping a service that sorts after izvor must not move izvor.
    const withAll = seriesColor('izvor', ['impuls', 'izvor', 'spomen']);
    const withoutSpomen = seriesColor('izvor', ['impuls', 'izvor']);
    expect(withAll).toBe(withoutSpomen);
  });

  it('wraps around after the eighth slot rather than inventing a hue', () => {
    const names = Array.from({ length: 10 }, (_, i) => `svc-${String(i).padStart(2, '0')}`);
    expect(seriesColor('svc-08', names)).toBe('var(--chart-1)');
  });

  it('falls back to the first slot for an unknown name', () => {
    expect(seriesColor('missing', ['a', 'b'])).toBe('var(--chart-1)');
  });
});
