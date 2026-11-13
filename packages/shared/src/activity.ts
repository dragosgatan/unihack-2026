import { z } from 'zod';
import { sideSchema, type Language } from './common.ts';

export const activityIds = [
  'finger-tapping',
  'trail-making-a',
  'trail-making-b',
  'clock-drawing',
  'word-recall',
  'spiral-tracing',
  'shoulder-raise',
  'sit-to-stand',
  'single-leg-squat',
  'check-in-pain',
  'check-in-medication',
  'check-in-episodes',
] as const;

export const activityIdSchema = z.enum(activityIds);
export const activityKindSchema = z.enum(['check-in', 'test', 'exercise']);

export type ActivityId = z.infer<typeof activityIdSchema>;
export type ActivityKind = z.infer<typeof activityKindSchema>;

export type ActivityModuleProps<Config, RawResult> = {
  config: Config;
  language: Language;
  onComplete: (rawResult: RawResult) => void;
};

export const fingerTappingConfigSchema = z.object({
  sides: z.array(sideSchema).min(1),
  trialDurationMs: z.number().int().positive(),
});

export const fingerTappingTapSchema = z.object({
  t: z.number().nonnegative(),
  target: z.enum(['a', 'b']),
  x: z.number(),
  y: z.number(),
});

export const fingerTappingTrialSchema = z.object({
  side: sideSchema,
  prosthesis: z.boolean(),
  durationMs: z.number().positive(),
  taps: z.array(fingerTappingTapSchema),
});

export const fingerTappingRawResultSchema = z.object({
  trials: z.array(fingerTappingTrialSchema).min(1),
});

export type FingerTappingConfig = z.infer<typeof fingerTappingConfigSchema>;
export type FingerTappingTap = z.infer<typeof fingerTappingTapSchema>;
export type FingerTappingTrial = z.infer<typeof fingerTappingTrialSchema>;
export type FingerTappingRawResult = z.infer<typeof fingerTappingRawResultSchema>;

const rawResultMember = <Id extends ActivityId, Data extends z.ZodType>(activityId: Id, data: Data) =>
  z.object({ activityId: z.literal(activityId), data });

export const rawResultSchema = z.discriminatedUnion('activityId', [
  rawResultMember('finger-tapping', fingerTappingRawResultSchema),
]);

export type RawResult = z.infer<typeof rawResultSchema>;
