import { describe, expect, it } from 'vitest';
import { activityIdSchema } from './activity.ts';
import { metricDefinitions, metricIdSchema, metricIds, metricSeriesSchema, skipEventSchema } from './metrics.ts';
import { levodopaChange, tappingSkipEvent, tapsPerSecondSeries } from './test-fixtures.ts';

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

describe('skipEventSchema', () => {
  it('accepts a skip with its session, reason and stage', () => {
    expect(skipEventSchema.safeParse(tappingSkipEvent).success).toBe(true);
  });

  it('rejects a timeline event', () => {
    expect(skipEventSchema.safeParse(levodopaChange).success).toBe(false);
  });
});

describe('metricSeriesSchema', () => {
  it('accepts a series with baseline, band, timeline and skip events', () => {
    expect(metricSeriesSchema.safeParse(tapsPerSecondSeries).success).toBe(true);
  });

  it('accepts a series with no baseline or band yet', () => {
    const series = { ...tapsPerSecondSeries, baseline: null, referenceBand: null, events: [] };
    expect(metricSeriesSchema.safeParse(series).success).toBe(true);
  });

  it('rejects a skip event without a reason', () => {
    const { id, t, type, label, sessionId, stage } = tappingSkipEvent;
    const series = { ...tapsPerSecondSeries, events: [{ id, t, type, label, sessionId, stage }] };
    expect(metricSeriesSchema.safeParse(series).success).toBe(false);
  });
});
