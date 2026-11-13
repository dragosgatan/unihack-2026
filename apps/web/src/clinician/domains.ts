import type { MetricId } from '@tempo/shared';
import type { RowTint } from '../ui/index.ts';

export const domains = ['memory', 'attention', 'executive', 'motor', 'mobility', 'check-in'] as const;

export type Domain = (typeof domains)[number];

export const domainLabels: Record<Domain, string> = {
  memory: 'Memory',
  attention: 'Attention',
  executive: 'Executive function',
  motor: 'Motor',
  mobility: 'Mobility',
  'check-in': 'Check-in',
};

export const domainTints: Record<Domain, RowTint> = {
  memory: 'cat-memory',
  attention: 'cat-attention',
  executive: 'cat-executive',
  motor: 'cat-motor',
  mobility: 'cat-mobility',
  'check-in': 'accent',
};

export const metricDomains: Record<MetricId, Domain> = {
  'finger-tapping.taps-per-second': 'motor',
  'finger-tapping.variability': 'motor',
  'finger-tapping.decrement': 'motor',
  'trail-making-a.time': 'attention',
  'trail-making-a.errors': 'attention',
  'trail-making-b.time': 'executive',
  'trail-making-b.errors': 'executive',
  'clock-drawing.score': 'executive',
  'word-recall.immediate': 'memory',
  'word-recall.delayed': 'memory',
  'spiral-tracing.deviation': 'motor',
  'spiral-tracing.tremor-frequency': 'motor',
  'spiral-tracing.speed': 'motor',
  'shoulder-raise.peak-angle': 'mobility',
  'shoulder-raise.repetitions': 'mobility',
  'shoulder-raise.smoothness': 'mobility',
  'sit-to-stand.count': 'mobility',
  'sit-to-stand.time-per-repetition': 'mobility',
  'single-leg-squat.depth': 'mobility',
  'single-leg-squat.knee-angle': 'mobility',
  'single-leg-squat.knee-valgus': 'mobility',
  'single-leg-squat.symmetry': 'mobility',
  'pain.intensity': 'check-in',
  'medication.adherence': 'check-in',
  'episodes.count': 'check-in',
};

export function isDomain(value: string | undefined): value is Domain {
  return domains.some((domain) => domain === value);
}
