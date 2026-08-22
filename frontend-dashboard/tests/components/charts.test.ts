/**
 * Tests for the chart data transform.
 *
 * pivotSeries turns the API's long-form rows into the wide form recharts
 * needs. The behaviour that matters: series order is stable (so a colour
 * follows the entity rather than its rank) and gaps become zeros (so a line
 * does not break into disconnected segments).
 */

import { describe, it, expect } from 'vitest';
import { pivotSeries } from '@/components/observability/charts';

describe('pivotSeries', () => {
  const rows = [
    { bucket: '2026-08-22T10:00:00Z', service: 'impuls', requests: 5 },
    { bucket: '2026-08-22T10:00:00Z', service: 'spomen', requests: 2 },
    { bucket: '2026-08-22T10:01:00Z', service: 'impuls', requests: 7 },
  ];

  it('produces one row per bucket with a column per series', () => {
    const { data } = pivotSeries(rows, 'bucket', 'service', 'requests');

    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      bucket: '2026-08-22T10:00:00Z',
      impuls: 5,
      spomen: 2,
    });
  });

  it('fills missing points with zero so lines stay continuous', () => {
    const { data } = pivotSeries(rows, 'bucket', 'service', 'requests');

    // spomen reported nothing in the second bucket.
    expect(data[1]).toMatchObject({ impuls: 7, spomen: 0 });
  });

  it('returns series names sorted, not in first-seen order', () => {
    const reversed = [
      { bucket: 'b1', service: 'zebra', requests: 1 },
      { bucket: 'b1', service: 'alpha', requests: 2 },
    ];
    const { seriesNames } = pivotSeries(reversed, 'bucket', 'service', 'requests');

    // Sorted order is what keeps a colour attached to its entity.
    expect(seriesNames).toEqual(['alpha', 'zebra']);
  });

  it('orders buckets chronologically', () => {
    const shuffled = [
      { bucket: '2026-08-22T10:02:00Z', service: 'a', requests: 3 },
      { bucket: '2026-08-22T10:00:00Z', service: 'a', requests: 1 },
      { bucket: '2026-08-22T10:01:00Z', service: 'a', requests: 2 },
    ];
    const { data } = pivotSeries(shuffled, 'bucket', 'service', 'requests');

    expect(data.map((d) => d.a)).toEqual([1, 2, 3]);
  });

  it('coerces string values from the API into numbers', () => {
    // ClickHouse returns large integers as strings over JSON.
    const stringy = [{ bucket: 'b1', service: 'a', requests: '42' }];
    const { data } = pivotSeries(stringy, 'bucket', 'service', 'requests');

    expect(data[0].a).toBe(42);
  });

  it('treats a null value as zero rather than NaN', () => {
    const withNull = [{ bucket: 'b1', service: 'a', requests: null }];
    const { data } = pivotSeries(withNull, 'bucket', 'service', 'requests');

    expect(data[0].a).toBe(0);
  });

  it('handles an empty result set', () => {
    const { data, seriesNames } = pivotSeries([], 'bucket', 'service', 'requests');

    expect(data).toEqual([]);
    expect(seriesNames).toEqual([]);
  });

  it('supports a different value column, as histograms need', () => {
    const histogram = [{ bucket: 'b1', series: 'impuls', avg: 12.5, count: 4 }];
    const { data } = pivotSeries(histogram, 'bucket', 'series', 'avg');

    expect(data[0].impuls).toBe(12.5);
  });
});
