import { describe, expect, it } from 'vitest';
import { activityIdSchema } from './activity.ts';
import { metricDefinitions, metricIdSchema, metricIds, metricSeriesSchema } from './metrics.ts';
import { tapsPerSecondSeries } from './test-fixtures.ts';

describe('metricIdSchema', () => {
  it('accepts a dotted metric id', () => {
    expect(metricIdSchema.safeParse('sit-to-stand.count').success).toBe(true);
  });

  it('rejects a side encoded in the id', () => {
    expect(metricIdSchema.safeParse('finger-tapping.taps-per-second.left').success).toBe(false);
  });
});

describe('metricDefinitions', () => {
  it('defines every metric against a known activity', () => {
    for (const id of metricIds) expect(activityIdSchema.safeParse(metricDefinitions[id].activityId).success).toBe(true);
  });
});

describe('metricSeriesSchema', () => {
  it('accepts a series with baseline, band and events', () => {
    expect(metricSeriesSchema.safeParse(tapsPerSecondSeries).success).toBe(true);
  });

  it('accepts a series with no baseline or band yet', () => {
    const series = { ...tapsPerSecondSeries, baseline: null, referenceBand: null, events: [] };
    expect(metricSeriesSchema.safeParse(series).success).toBe(true);
  });
});
