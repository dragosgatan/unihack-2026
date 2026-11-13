import type { MetricId, MetricPoint, ReferenceBand } from './metrics.ts';

export const initialBaselineSessions = 3;

export const ownRangeMargins: Record<MetricId, number> = {
  'finger-tapping.taps-per-second': 0.4,
  'finger-tapping.variability': 4,
  'finger-tapping.decrement': 5,
  'trail-making-a.time': 8,
  'trail-making-a.errors': 1,
  'trail-making-b.time': 15,
  'trail-making-b.errors': 1,
  'clock-drawing.score': 1,
  'word-recall.immediate': 1,
  'word-recall.delayed': 1,
  'spiral-tracing.deviation': 0.8,
  'spiral-tracing.tremor-frequency': 0.6,
  'spiral-tracing.speed': 3,
  'shoulder-raise.peak-angle': 10,
  'shoulder-raise.repetitions': 2,
  'shoulder-raise.smoothness': 0.08,
  'sit-to-stand.count': 2,
  'sit-to-stand.time-per-repetition': 0.5,
  'single-leg-squat.depth': 8,
  'single-leg-squat.knee-angle': 8,
  'single-leg-squat.knee-valgus': 3,
  'single-leg-squat.symmetry': 6,
  'pain.intensity': 2,
  'medication.adherence': 10,
  'episodes.count': 1,
};

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

export const initialBaseline = (firstPoints: MetricPoint[]): number | null =>
  firstPoints.length >= initialBaselineSessions
    ? median(firstPoints.slice(0, initialBaselineSessions).map((point) => point.value))
    : null;

const roundTo = (value: number, places: number): number => Number(value.toFixed(places));

export const ownRange = (metricId: MetricId, baseline: number): ReferenceBand => {
  const margin = ownRangeMargins[metricId];
  return { low: roundTo(Math.max(0, baseline - margin), 2), high: roundTo(baseline + margin, 2) };
};
