import { describe, expect, it } from 'vitest';
import type { MetricId, MetricSeries, SkipEvent, SkipReason } from '@tempo/shared';
import { highlightsFrom } from './highlights.ts';

const now = Date.parse('2026-11-14T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(now - days * 86_400_000).toISOString();
}

function series(metricId: MetricId, values: number[], overrides: Partial<MetricSeries> = {}): MetricSeries {
  return {
    metricId,
    unit: 'unit',
    points: values.map((value, index) => ({ t: daysAgo((values.length - index) * 3), value })),
    baseline: 10,
    referenceBand: { low: 8, high: 12 },
    events: [],
    ...overrides,
  };
}

function skip(id: string, days: number, reason: SkipReason): SkipEvent {
  return { id, t: daysAgo(days), type: 'skip', label: 'Skipped', sessionId: `s-${id}`, reason, stage: 'practice' };
}

describe('highlightsFrom', () => {
  it('reports the latest sessions above the usual range with the length of the run', () => {
    const [highlight] = highlightsFrom([series('trail-making-b.time', [10, 13, 14], { unit: 's' })], now);
    expect(highlight?.kind).toBe('outside-range');
    expect(highlight?.sentence).toBe("Trail Making B time was above the patient's usual range in the last 2 sessions.");
  });

  it('says latest session when only the newest value is outside', () => {
    const [highlight] = highlightsFrom([series('word-recall.delayed', [10, 11, 7], { unit: 'words' })], now);
    expect(highlight?.sentence).toBe("Word recall, delayed was below the patient's usual range in the latest session.");
  });

  it('counts skips this month and names the most recent reason', () => {
    const tapping = series('finger-tapping.taps-per-second', [10], { events: [skip('a', 20, 'tired'), skip('b', 2, 'pain'), skip('old', 40, 'pain')] });
    const [highlight] = highlightsFrom([tapping], now);
    expect(highlight?.kind).toBe('skips');
    expect(highlight?.sentence).toBe('Skipped twice this month, most recently because of pain.');
  });

  it('reports a clear change of the monthly average against baseline', () => {
    const [highlight] = highlightsFrom([series('finger-tapping.taps-per-second', [11, 11.4], { unit: 'taps/s', baseline: 10 })], now);
    expect(highlight?.kind).toBe('change');
    expect(highlight?.sentence).toBe('Finger tapping speed averaged 11.2 taps/s this month, up from a baseline of 10 taps/s.');
  });

  it('ignores small changes, single points and old data', () => {
    expect(highlightsFrom([series('clock-drawing.score', [10.2, 10.4])], now)).toEqual([]);
    expect(highlightsFrom([series('clock-drawing.score', [20])], now)).toEqual([]);
    const old = series('clock-drawing.score', [20, 20], { points: [{ t: daysAgo(45), value: 20 }, { t: daysAgo(40), value: 20 }] });
    expect(highlightsFrom([old], now)).toEqual([]);
    expect(highlightsFrom([series('clock-drawing.score', [20, 20], { baseline: null, referenceBand: null })], now)).toEqual([]);
  });

  it('ranks worse-direction range findings, then pain skips, other skips, better-direction findings and changes', () => {
    const result = highlightsFrom(
      [
        series('trail-making-a.time', [11, 11.5]),
        series('word-recall.immediate', [13, 14]),
        series('sit-to-stand.count', [10], { events: [skip('t', 3, 'tired')] }),
        series('pain.intensity', [10], { events: [skip('p', 5, 'pain')] }),
        series('trail-making-b.time', [13, 14]),
      ],
      now,
    );
    expect(result.map((highlight) => highlight.metricId)).toEqual([
      'trail-making-b.time',
      'pain.intensity',
      'sit-to-stand.count',
      'word-recall.immediate',
    ]);
  });

  it('keeps one finding per metric and one skip finding per activity', () => {
    const skips = [skip('a', 3, 'pain')];
    const result = highlightsFrom(
      [
        series('finger-tapping.taps-per-second', [10], { events: skips }),
        series('finger-tapping.variability', [10], { events: skips }),
        series('trail-making-b.time', [13, 14], { events: [skip('b', 2, 'tired')] }),
      ],
      now,
    );
    expect(result.map((highlight) => [highlight.metricId, highlight.kind])).toEqual([
      ['trail-making-b.time', 'outside-range'],
      ['finger-tapping.taps-per-second', 'skips'],
    ]);
  });
});
