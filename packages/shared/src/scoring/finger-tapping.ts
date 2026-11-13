import type { FingerTappingRawResult, FingerTappingTrial } from '../activity.ts';
import type { MetricId } from '../metrics.ts';
import type { Score } from '../session.ts';

const roundTo = (value: number, places: number): number => Number(value.toFixed(places));

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

export const tapsPerSecond = (trial: FingerTappingTrial): number => trial.taps.length / (trial.durationMs / 1000);

export const intervalVariability = (trial: FingerTappingTrial): number | undefined => {
  const times = trial.taps.map((tap) => tap.t).sort((a, b) => a - b);
  const intervals = times.slice(1).map((t, index) => t - (times[index] ?? t));
  if (intervals.length < 2) return undefined;
  const average = mean(intervals);
  if (average === 0) return undefined;
  const variance = intervals.reduce((sum, interval) => sum + (interval - average) ** 2, 0) / (intervals.length - 1);
  return (Math.sqrt(variance) / average) * 100;
};

export const decrement = (trial: FingerTappingTrial): number | undefined => {
  const third = trial.durationMs / 3;
  const first = trial.taps.filter((tap) => tap.t < third).length;
  const last = trial.taps.filter((tap) => tap.t >= trial.durationMs - third).length;
  return first === 0 ? undefined : ((first - last) / first) * 100;
};

const score = (metricId: MetricId, value: number | undefined, trial: FingerTappingTrial): Score[] =>
  value === undefined ? [] : [{ metricId, side: trial.side, value: roundTo(value, 2), scoredBy: 'code' }];

export const scoreFingerTapping = (raw: FingerTappingRawResult): Score[] => {
  const firstPerSide = raw.trials.filter(
    (trial, index) => raw.trials.findIndex((other) => other.side === trial.side) === index,
  );
  return firstPerSide.flatMap((trial) => [
    ...score('finger-tapping.taps-per-second', tapsPerSecond(trial), trial),
    ...score('finger-tapping.variability', intervalVariability(trial), trial),
    ...score('finger-tapping.decrement', decrement(trial), trial),
  ]);
};
