import { describe, expect, it } from 'vitest';
import { rawResultSchema, type TrailMakingRawResult } from '../activity.ts';
import { scoreResult } from './index.ts';
import { scoreTrailMaking, trailProgress } from './trail-making.ts';

const targets = ['1', 'A', '2', 'B'].map((label, index) => ({ label, x: index / 4, y: 0.5 }));

const raw = (sequence: [t: number, target: number][]): TrailMakingRawResult => ({
  hand: 'left',
  targets,
  taps: sequence.map(([t, target]) => ({ t, target })),
});

describe('trailProgress', () => {
  it('finishes at the tap that joins the last circle', () => {
    expect(trailProgress(raw([[900, 0], [2100, 1], [3000, 2], [4250, 3]]).taps, 4)).toEqual({
      next: 4,
      errors: 0,
      finishedAt: 4250,
    });
  });

  it('counts a tap on a circle further along the trail as an error', () => {
    expect(trailProgress(raw([[100, 0], [200, 2], [300, 1], [400, 3]]).taps, 4)).toMatchObject({ errors: 2 });
  });

  it('ignores taps on circles already joined and repeat taps on the same wrong circle', () => {
    const taps = raw([[100, 0], [120, 0], [200, 3], [220, 3], [300, 0], [400, 1]]).taps;
    expect(trailProgress(taps, 4)).toEqual({ next: 2, errors: 1 });
  });

  it('reads taps in time order', () => {
    expect(trailProgress(raw([[400, 3], [100, 0], [300, 2], [200, 1]]).taps, 4)).toMatchObject({ errors: 0, finishedAt: 400 });
  });
});

describe('scoreTrailMaking', () => {
  it('gives the time in seconds and the error count for the part, without a side', () => {
    expect(scoreTrailMaking('b', raw([[900, 0], [1500, 2], [2100, 1], [3000, 2], [4250, 3]]))).toEqual([
      { metricId: 'trail-making-b.time', value: 4.3, scoredBy: 'code' },
      { metricId: 'trail-making-b.errors', value: 1, scoredBy: 'code' },
    ]);
  });

  it('gives nothing for an unfinished trail', () => {
    expect(scoreTrailMaking('a', raw([[100, 0], [200, 1]]))).toEqual([]);
  });
});

describe('trail making raw result', () => {
  it('is scored through scoreResult for both parts', () => {
    const data = raw([[100, 0], [200, 1], [300, 2], [1000, 3]]);
    expect(scoreResult({ activityId: 'trail-making-a', data })).toEqual(scoreTrailMaking('a', data));
    expect(scoreResult({ activityId: 'trail-making-b', data })).toEqual(scoreTrailMaking('b', data));
  });

  it('rejects a tap on a circle that does not exist', () => {
    const data = raw([[100, 4]]);
    expect(rawResultSchema.safeParse({ activityId: 'trail-making-a', data }).success).toBe(false);
    expect(rawResultSchema.safeParse({ activityId: 'trail-making-a', data: raw([[100, 0]]) }).success).toBe(true);
  });
});
