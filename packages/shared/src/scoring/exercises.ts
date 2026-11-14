import type { Side } from '../common.ts';
import type { ShoulderRaiseRawResult, SingleLegSquatRawResult, SitToStandRawResult } from '../exercise.ts';
import type { MetricId } from '../metrics.ts';
import type { Score } from '../session.ts';
import { smoothness } from './reps.ts';

const roundTo = (value: number, places: number): number => Number(value.toFixed(places));

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const score = (metricId: MetricId, value: number, places: number, side?: Side): Score => ({
  metricId,
  value: roundTo(value, places),
  ...(side && { side }),
  scoredBy: 'code',
});

const firstPerSide = <T extends { side: Side }>(trials: T[]): T[] =>
  trials.filter((trial, index) => trials.findIndex((other) => other.side === trial.side) === index);

export const scoreShoulderRaise = (raw: ShoulderRaiseRawResult): Score[] =>
  firstPerSide(raw.trials).flatMap(({ side, reps }) => [
    score('shoulder-raise.repetitions', reps.length, 0, side),
    ...(reps.length === 0
      ? []
      : [
          score('shoulder-raise.peak-angle', median(reps.map((rep) => Math.max(...rep.angles))), 1, side),
          score('shoulder-raise.smoothness', mean(reps.map((rep) => smoothness(rep.angles))), 2, side),
        ]),
  ]);

export const scoreSitToStand = (raw: SitToStandRawResult): Score[] => [
  score('sit-to-stand.count', raw.reps.length, 0),
  ...(raw.reps.length === 0 ? [] : [score('sit-to-stand.time-per-repetition', raw.durationMs / 1000 / raw.reps.length, 2)]),
];

export const scoreSingleLegSquat = (raw: SingleLegSquatRawResult): Score[] => {
  const sides = firstPerSide(raw.trials).filter((trial) => trial.reps.length > 0);
  const perSide = sides.map(({ side, reps }) => ({
    side,
    kneeFlexion: median(reps.map((rep) => rep.kneeFlexion)),
    depth: median(reps.map((rep) => rep.depth)),
    valgus: median(reps.map((rep) => rep.valgus)),
  }));
  const [a, b] = perSide;
  // The plan does not name the injured leg, so symmetry is the weaker side as a percentage of the stronger one.
  const symmetry =
    a && b && Math.max(a.kneeFlexion, b.kneeFlexion) > 0
      ? [score('single-leg-squat.symmetry', (Math.min(a.kneeFlexion, b.kneeFlexion) / Math.max(a.kneeFlexion, b.kneeFlexion)) * 100, 1)]
      : [];
  return [
    ...perSide.flatMap(({ side, kneeFlexion, depth, valgus }) => [
      score('single-leg-squat.depth', depth, 1, side),
      score('single-leg-squat.knee-angle', kneeFlexion, 1, side),
      score('single-leg-squat.knee-valgus', valgus, 1, side),
    ]),
    ...symmetry,
  ];
};
