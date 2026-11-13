import { z } from 'zod';
import type { ActivityId } from './activity.ts';
import { isoDateTimeSchema } from './common.ts';
import { timelineEventSchema } from './record.ts';

export const metricIds = [
  'finger-tapping.taps-per-second',
  'finger-tapping.variability',
  'finger-tapping.decrement',
  'trail-making-a.time',
  'trail-making-a.errors',
  'trail-making-b.time',
  'trail-making-b.errors',
  'clock-drawing.score',
  'word-recall.immediate',
  'word-recall.delayed',
  'spiral-tracing.deviation',
  'spiral-tracing.tremor-frequency',
  'spiral-tracing.speed',
  'shoulder-raise.peak-angle',
  'shoulder-raise.repetitions',
  'shoulder-raise.smoothness',
  'sit-to-stand.count',
  'sit-to-stand.time-per-repetition',
  'single-leg-squat.depth',
  'single-leg-squat.knee-angle',
  'single-leg-squat.knee-valgus',
  'single-leg-squat.symmetry',
  'pain.intensity',
  'medication.adherence',
  'episodes.count',
] as const;

export const metricIdSchema = z.enum(metricIds);

export type MetricId = z.infer<typeof metricIdSchema>;

export type MetricDefinition = {
  activityId: ActivityId;
  unit: string;
  lateral: boolean;
  higherIsBetter: boolean;
};

export const metricDefinitions = {
  'finger-tapping.taps-per-second': { activityId: 'finger-tapping', unit: 'taps/s', lateral: true, higherIsBetter: true },
  'finger-tapping.variability': { activityId: 'finger-tapping', unit: '%', lateral: true, higherIsBetter: false },
  'finger-tapping.decrement': { activityId: 'finger-tapping', unit: '%', lateral: true, higherIsBetter: false },
  'trail-making-a.time': { activityId: 'trail-making-a', unit: 's', lateral: false, higherIsBetter: false },
  'trail-making-a.errors': { activityId: 'trail-making-a', unit: 'count', lateral: false, higherIsBetter: false },
  'trail-making-b.time': { activityId: 'trail-making-b', unit: 's', lateral: false, higherIsBetter: false },
  'trail-making-b.errors': { activityId: 'trail-making-b', unit: 'count', lateral: false, higherIsBetter: false },
  'clock-drawing.score': { activityId: 'clock-drawing', unit: 'points', lateral: false, higherIsBetter: true },
  'word-recall.immediate': { activityId: 'word-recall', unit: 'words', lateral: false, higherIsBetter: true },
  'word-recall.delayed': { activityId: 'word-recall', unit: 'words', lateral: false, higherIsBetter: true },
  'spiral-tracing.deviation': { activityId: 'spiral-tracing', unit: 'mm', lateral: true, higherIsBetter: false },
  'spiral-tracing.tremor-frequency': { activityId: 'spiral-tracing', unit: 'Hz', lateral: true, higherIsBetter: false },
  'spiral-tracing.speed': { activityId: 'spiral-tracing', unit: 'mm/s', lateral: true, higherIsBetter: true },
  'shoulder-raise.peak-angle': { activityId: 'shoulder-raise', unit: '°', lateral: true, higherIsBetter: true },
  'shoulder-raise.repetitions': { activityId: 'shoulder-raise', unit: 'count', lateral: true, higherIsBetter: true },
  'shoulder-raise.smoothness': { activityId: 'shoulder-raise', unit: 'index', lateral: true, higherIsBetter: true },
  'sit-to-stand.count': { activityId: 'sit-to-stand', unit: 'count', lateral: false, higherIsBetter: true },
  'sit-to-stand.time-per-repetition': { activityId: 'sit-to-stand', unit: 's', lateral: false, higherIsBetter: false },
  'single-leg-squat.depth': { activityId: 'single-leg-squat', unit: '%', lateral: true, higherIsBetter: true },
  'single-leg-squat.knee-angle': { activityId: 'single-leg-squat', unit: '°', lateral: true, higherIsBetter: true },
  'single-leg-squat.knee-valgus': { activityId: 'single-leg-squat', unit: '°', lateral: true, higherIsBetter: false },
  'single-leg-squat.symmetry': { activityId: 'single-leg-squat', unit: '%', lateral: false, higherIsBetter: true },
  'pain.intensity': { activityId: 'check-in-pain', unit: '0-10', lateral: false, higherIsBetter: false },
  'medication.adherence': { activityId: 'check-in-medication', unit: '%', lateral: false, higherIsBetter: true },
  'episodes.count': { activityId: 'check-in-episodes', unit: 'count', lateral: false, higherIsBetter: false },
} as const satisfies Record<MetricId, MetricDefinition>;

export const metricPointSchema = z.object({
  t: isoDateTimeSchema,
  value: z.number(),
});

export const referenceBandSchema = z.object({
  low: z.number(),
  high: z.number(),
});

export const metricSeriesSchema = z.object({
  metricId: metricIdSchema,
  unit: z.string().min(1),
  points: z.array(metricPointSchema),
  baseline: z.number().nullable(),
  referenceBand: referenceBandSchema.nullable(),
  events: z.array(timelineEventSchema),
});

export type MetricPoint = z.infer<typeof metricPointSchema>;
export type ReferenceBand = z.infer<typeof referenceBandSchema>;
export type MetricSeries = z.infer<typeof metricSeriesSchema>;
