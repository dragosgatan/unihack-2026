import type { TrailMakingRawResult, TrailMakingTap } from '../activity.ts';
import type { Score } from '../session.ts';

export type TrailProgress = { next: number; errors: number; finishedAt?: number };

export const trailProgress = (taps: TrailMakingTap[], targetCount: number): TrailProgress => {
  let next = 0;
  let errors = 0;
  let previous: number | undefined;
  // Taps on circles already joined and repeat taps on the same wrong circle are not errors, so a tremor's double touch is not counted (spec section 9).
  for (const tap of [...taps].sort((a, b) => a.t - b.t)) {
    if (tap.target === next) {
      next += 1;
      if (next === targetCount) return { next, errors, finishedAt: tap.t };
    } else if (tap.target > next && tap.target !== previous) {
      errors += 1;
    }
    previous = tap.target;
  }
  return { next, errors };
};

export const scoreTrailMaking = (part: 'a' | 'b', raw: TrailMakingRawResult): Score[] => {
  const { errors, finishedAt } = trailProgress(raw.taps, raw.targets.length);
  if (finishedAt === undefined) return [];
  return [
    { metricId: `trail-making-${part}.time`, value: Number((finishedAt / 1000).toFixed(1)), scoredBy: 'code' },
    { metricId: `trail-making-${part}.errors`, value: errors, scoredBy: 'code' },
  ];
};
