import { describe, expect, it } from 'vitest';
import type { FingerTappingTrial } from '../activity.ts';
import { decrement, intervalVariability, scoreFingerTapping, tapsPerSecond } from './finger-tapping.ts';
import { scoreResult } from './index.ts';
import { fingerTappingResult } from '../test-fixtures.ts';

const trial = (side: 'left' | 'right', times: number[], durationMs = 15000): FingerTappingTrial => ({
  side,
  prosthesis: false,
  durationMs,
  taps: times.map((t, index) => ({ t, target: index % 2 === 0 ? 'a' : 'b', x: 0, y: 0 })),
});

const evenly = (count: number, everyMs: number): number[] => Array.from({ length: count }, (_, i) => i * everyMs);

describe('tapsPerSecond', () => {
  it('divides the taps by the trial length in seconds', () => {
    expect(tapsPerSecond(trial('right', evenly(60, 250)))).toBe(4);
  });

  it('is zero for a trial with no taps', () => {
    expect(tapsPerSecond(trial('right', []))).toBe(0);
  });
});

describe('intervalVariability', () => {
  it('is zero for a perfectly even rhythm', () => {
    expect(intervalVariability(trial('right', evenly(10, 200)))).toBe(0);
  });

  it('is the coefficient of variation of the intervals in percent', () => {
    expect(intervalVariability(trial('right', [0, 100, 300, 400, 600]))).toBeCloseTo(38.49, 2);
  });

  it('needs at least two intervals', () => {
    expect(intervalVariability(trial('right', [0, 100]))).toBeUndefined();
  });

  it('ignores the order taps were recorded in', () => {
    expect(intervalVariability(trial('right', [300, 0, 100]))).toBe(intervalVariability(trial('right', [0, 100, 300])));
  });
});

describe('decrement', () => {
  it('is the drop from the first to the last third in percent', () => {
    const times = [...evenly(20, 250), ...evenly(10, 500).map((t) => t + 10000)];
    expect(decrement(trial('right', times))).toBe(50);
  });

  it('is negative when the patient speeds up', () => {
    const times = [...evenly(10, 500), ...evenly(20, 250).map((t) => t + 10000)];
    expect(decrement(trial('right', times))).toBe(-100);
  });

  it('is undefined when nothing was tapped in the first third', () => {
    expect(decrement(trial('right', [12000, 13000]))).toBeUndefined();
  });
});

describe('scoreFingerTapping', () => {
  it('gives one score per metric per side, rounded and marked as computed in code', () => {
    const scores = scoreFingerTapping({
      trials: [trial('right', evenly(60, 250)), trial('left', evenly(30, 500))],
    });
    expect(scores).toEqual([
      { metricId: 'finger-tapping.taps-per-second', side: 'right', value: 4, scoredBy: 'code' },
      { metricId: 'finger-tapping.variability', side: 'right', value: 0, scoredBy: 'code' },
      { metricId: 'finger-tapping.decrement', side: 'right', value: 0, scoredBy: 'code' },
      { metricId: 'finger-tapping.taps-per-second', side: 'left', value: 2, scoredBy: 'code' },
      { metricId: 'finger-tapping.variability', side: 'left', value: 0, scoredBy: 'code' },
      { metricId: 'finger-tapping.decrement', side: 'left', value: 0, scoredBy: 'code' },
    ]);
  });

  it('scores only the first trial of a side', () => {
    const scores = scoreFingerTapping({ trials: [trial('right', evenly(60, 250)), trial('right', [])] });
    expect(scores.filter((score) => score.metricId === 'finger-tapping.taps-per-second')).toEqual([
      { metricId: 'finger-tapping.taps-per-second', side: 'right', value: 4, scoredBy: 'code' },
    ]);
  });

  it('leaves out metrics a short trial cannot support', () => {
    expect(scoreFingerTapping({ trials: [trial('left', [260])] })).toEqual([
      { metricId: 'finger-tapping.taps-per-second', side: 'left', value: 0.07, scoredBy: 'code' },
      { metricId: 'finger-tapping.decrement', side: 'left', value: 100, scoredBy: 'code' },
    ]);
  });
});

describe('scoreResult', () => {
  it('dispatches on the activity id', () => {
    expect(scoreResult(fingerTappingResult)).toEqual(scoreFingerTapping(fingerTappingResult.data));
  });
});
