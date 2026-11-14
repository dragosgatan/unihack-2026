import { describe, expect, it } from 'vitest';
import { rawResultSchema } from '../activity.ts';
import type { Side } from '../common.ts';
import { exerciseRepetitions, scoreShoulderRaise, scoreSingleLegSquat, scoreSitToStand } from './exercises.ts';
import shoulderRaiseRight from './fixtures/shoulder-raise-right.json' with { type: 'json' };
import singleLegSquatLeft from './fixtures/single-leg-squat-left.json' with { type: 'json' };
import singleLegSquatRight from './fixtures/single-leg-squat-right.json' with { type: 'json' };
import sitToStand from './fixtures/sit-to-stand.json' with { type: 'json' };
import { scoreResult } from './index.ts';
import { kneeFlexion, kneeValgus, shoulderElevation, type Landmark, type Pose } from './pose.ts';
import { finishReps, smoothness, startReps, trackReps, type RepSample } from './reps.ts';
import {
  shoulderRaiseTracking,
  singleLegSquatTracking,
  sitToStandTracking,
  type ExerciseTracking,
} from './tracking.ts';

type Recording = { indices: number[]; frames: number[][] };

const decode = ({ indices, frames }: Recording) =>
  frames.map(([t = 0, ...values]) => {
    const pose: Landmark[] = [];
    indices.forEach((index, i) => {
      const [x = 0, y = 0, z = 0, visibility = 0] = values.slice(i * 4, i * 4 + 4);
      pose[index] = { x, y, z, visibility };
    });
    return { t, pose };
  });

const run = <S extends RepSample, R>(tracking: ExerciseTracking<S, R>, recording: Recording, side: Side) => {
  const frames = decode(recording);
  let state = startReps<S>();
  for (const { t, pose } of frames) {
    const sample = tracking.sample(pose, side, t);
    if (sample) state = trackReps(state, sample, tracking.thresholds);
  }
  return finishReps(state, frames.at(-1)?.t ?? 0).map(tracking.rep);
};

const expectNear = (actual: number[], expected: number[], tolerance = 5) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => expect(Math.abs(value - (expected[i] ?? NaN))).toBeLessThanOrEqual(tolerance));
};

const at = (points: Record<number, readonly [number, number, number]>): Pose => {
  const pose: Landmark[] = [];
  for (const [index, [x, y, z]] of Object.entries(points)) pose[Number(index)] = { x, y, z, visibility: 1 };
  return pose;
};

const trunk = { 11: [0.18, -0.5, 0], 12: [-0.18, -0.5, 0], 23: [0.1, 0, 0], 24: [-0.1, 0, 0] } as const;

describe('pose angles', () => {
  it('measures shoulder elevation against the trunk', () => {
    expect(shoulderElevation(at({ ...trunk, 14: [-0.18, -0.22, 0] }), 'right')).toBeCloseTo(0);
    expect(shoulderElevation(at({ ...trunk, 14: [-0.46, -0.5, 0] }), 'right')).toBeCloseTo(90);
    expect(shoulderElevation(at({ ...trunk, 14: [-0.18, -0.5, -0.28] }), 'right')).toBeCloseTo(90);
  });

  it('is undefined when a joint is not visible', () => {
    const pose = at({ ...trunk, 14: [-0.46, -0.5, 0] });
    expect(shoulderElevation(pose.map((p, i) => (i === 14 ? { ...p, visibility: 0.1 } : p)), 'right')).toBeUndefined();
  });

  it('measures knee flexion in 3D and valgus only when the knee drifts inward', () => {
    const straight = at({ ...trunk, 25: [0.1, 0.45, 0], 27: [0.1, 0.87, 0] });
    expect(kneeFlexion(straight, 'left')).toBeCloseTo(0);
    expect(kneeFlexion(at({ ...trunk, 25: [0.1, 0, -0.45], 27: [0.1, 0.42, -0.45] }), 'left')).toBeCloseTo(90);
    expect(kneeValgus(at({ ...trunk, 25: [0.05, 0.45, 0], 27: [0.1, 0.87, 0] }), 'left')).toBeGreaterThan(10);
    expect(kneeValgus(at({ ...trunk, 25: [0.15, 0.45, 0], 27: [0.1, 0.87, 0] }), 'left')).toBe(0);
  });
});

describe('trackReps', () => {
  const thresholds = { enter: 40, exit: 25 };
  const feed = (values: number[]) =>
    values.reduce((state, value, t) => trackReps(state, { t, value }, thresholds), startReps<RepSample>());

  it('counts a rep from rising above enter to falling below exit', () => {
    const state = feed([10, 30, 50, 90, 60, 35, 20, 10, 45, 80, 20]);
    expect(state.reps.map((rep) => [rep.startMs, rep.endMs, rep.samples.length])).toEqual([
      [2, 6, 4],
      [8, 10, 2],
    ]);
  });

  it('ignores wobble between the thresholds', () => {
    expect(feed([10, 50, 30, 45, 30, 50, 20]).reps).toHaveLength(1);
  });

  it('does not count a movement already under way when tracking starts', () => {
    expect(feed([80, 90, 20]).reps).toHaveLength(0);
  });

  it('closes a rep still in progress when the trial ends', () => {
    expect(finishReps(feed([10, 50, 60]), 99).map((rep) => rep.endMs)).toEqual([99]);
  });
});

describe('smoothness', () => {
  it('is 1 for one steady rise and fall', () => {
    expect(smoothness([40, 80, 120, 80, 30])).toBe(1);
  });

  it('drops when the movement stops and restarts', () => {
    expect(smoothness([40, 80, 60, 120, 70, 90, 30])).toBeCloseTo(170 / 250);
  });
});

describe('recorded landmark fixtures', () => {
  it('counts three right shoulder raises with their peak angles', () => {
    const reps = run(shoulderRaiseTracking, shoulderRaiseRight, 'right');
    expectNear(reps.map((rep) => Math.max(...rep.angles)), [120, 95, 140]);
    expect(run(shoulderRaiseTracking, shoulderRaiseRight, 'left')).toEqual([]);
  });

  it('counts the stands in a sit to stand, including one still standing at the end', () => {
    expect(run(sitToStandTracking, sitToStand, 'right')).toHaveLength(5);
  });

  it('shows the weaker, inward-drifting right leg in a single-leg squat', () => {
    const left = run(singleLegSquatTracking, singleLegSquatLeft, 'left');
    const right = run(singleLegSquatTracking, singleLegSquatRight, 'right');
    expectNear(left.map((rep) => rep.kneeFlexion), [70, 75, 72]);
    expectNear(right.map((rep) => rep.kneeFlexion), [50, 55, 52]);

    const scores = scoreSingleLegSquat({ trials: [{ side: 'left', reps: left }, { side: 'right', reps: right }] });
    const value = (metricId: string, side?: Side) =>
      scores.find((score) => score.metricId === metricId && score.side === side)?.value ?? NaN;
    expect(value('single-leg-squat.knee-valgus', 'right')).toBeGreaterThan(value('single-leg-squat.knee-valgus', 'left') + 5);
    expect(value('single-leg-squat.depth', 'right')).toBeLessThan(value('single-leg-squat.depth', 'left'));
    expect(value('single-leg-squat.symmetry')).toBeGreaterThan(65);
    expect(value('single-leg-squat.symmetry')).toBeLessThan(80);
  });
});

describe('exercise scorers', () => {
  it('scores shoulder raises per arm, with repetitions even when none were done', () => {
    expect(
      scoreShoulderRaise({
        trials: [
          { side: 'right', reps: [{ startMs: 0, endMs: 1, angles: [40, 100, 30] }, { startMs: 2, endMs: 3, angles: [45, 120, 60, 90, 30] }] },
          { side: 'left', reps: [] },
        ],
      }),
    ).toEqual([
      { metricId: 'shoulder-raise.repetitions', side: 'right', value: 2, scoredBy: 'code' },
      { metricId: 'shoulder-raise.peak-angle', side: 'right', value: 110, scoredBy: 'code' },
      { metricId: 'shoulder-raise.smoothness', side: 'right', value: 0.87, scoredBy: 'code' },
      { metricId: 'shoulder-raise.repetitions', side: 'left', value: 0, scoredBy: 'code' },
    ]);
  });

  it('scores sit to stand as a count and seconds per stand', () => {
    const reps = Array.from({ length: 12 }, (_, i) => ({ startMs: i * 2000, endMs: i * 2000 + 1000 }));
    expect(scoreSitToStand({ durationMs: 30000, reps })).toEqual([
      { metricId: 'sit-to-stand.count', value: 12, scoredBy: 'code' },
      { metricId: 'sit-to-stand.time-per-repetition', value: 2.5, scoredBy: 'code' },
    ]);
    expect(scoreSitToStand({ durationMs: 30000, reps: [] })).toEqual([
      { metricId: 'sit-to-stand.count', value: 0, scoredBy: 'code' },
    ]);
  });

  it('leaves out symmetry when only one leg has reps', () => {
    const scores = scoreSingleLegSquat({
      trials: [
        { side: 'left', reps: [{ startMs: 0, endMs: 1, kneeFlexion: 80, depth: 30, valgus: 4 }] },
        { side: 'right', reps: [] },
      ],
    });
    expect(scores.map((score) => score.metricId)).toEqual([
      'single-leg-squat.depth',
      'single-leg-squat.knee-angle',
      'single-leg-squat.knee-valgus',
    ]);
  });

  it('counts repetitions of an exercise across all trials and sides, and none for other activities', () => {
    const rep = { startMs: 0, endMs: 1000 };
    const squat = { ...rep, kneeFlexion: 80, depth: 30, valgus: 4 };
    expect(
      exerciseRepetitions({
        activityId: 'shoulder-raise',
        data: {
          trials: [
            { side: 'right', reps: [{ ...rep, angles: [90] }, { ...rep, angles: [100] }] },
            { side: 'left', reps: [{ ...rep, angles: [120] }] },
          ],
        },
      }),
    ).toBe(3);
    expect(
      exerciseRepetitions({
        activityId: 'single-leg-squat',
        data: { trials: [{ side: 'left', reps: [squat, squat] }, { side: 'right', reps: [] }] },
      }),
    ).toBe(2);
    expect(exerciseRepetitions({ activityId: 'sit-to-stand', data: { durationMs: 30000, reps: [rep, rep, rep, rep] } })).toBe(4);
    expect(exerciseRepetitions({ activityId: 'sit-to-stand', data: { durationMs: 30000, reps: [] } })).toBe(0);
    expect(exerciseRepetitions({ activityId: 'check-in-pain', data: { item: 'pain', intensity: 2 } })).toBeUndefined();
  });

  it('accepts tracked reps in the raw result schema and dispatches them from scoreResult', () => {
    const raw = rawResultSchema.parse({
      activityId: 'shoulder-raise',
      data: { trials: [{ side: 'right', reps: run(shoulderRaiseTracking, shoulderRaiseRight, 'right') }] },
    });
    expect(scoreResult(raw).find((score) => score.metricId === 'shoulder-raise.repetitions')?.value).toBe(3);
    expect(rawResultSchema.safeParse({ activityId: 'sit-to-stand', data: { durationMs: 30000, reps: [] } }).success).toBe(true);
  });
});
