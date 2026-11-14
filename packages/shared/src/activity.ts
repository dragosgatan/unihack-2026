import { z } from 'zod';
import { episodesCheckInSchema, medicationCheckInSchema, painCheckInSchema } from './checkin.ts';
import { idSchema, sideSchema, type Language } from './common.ts';
import {
  shoulderRaiseRawResultSchema,
  singleLegSquatRawResultSchema,
  sitToStandRawResultSchema,
} from './exercise.ts';

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

export const skipReasonSchema = z.enum([
  'pain',
  'tired',
  'not-understood',
  'cannot-see-or-hear',
  'physically-unable',
  'device-problem',
  'other',
]);
export const skipStageSchema = z.enum(['instructions', 'practice', 'task']);

export type ActivityId = z.infer<typeof activityIdSchema>;
export type ActivityKind = z.infer<typeof activityKindSchema>;
export type SkipReason = z.infer<typeof skipReasonSchema>;
export type SkipStage = z.infer<typeof skipStageSchema>;

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

export const medicationCheckInConfigSchema = z.object({
  medications: z.array(z.object({ medicationId: idSchema, name: z.string().min(1) })),
});

export type MedicationCheckInConfig = z.infer<typeof medicationCheckInConfigSchema>;

const rawResultMember = <Id extends ActivityId, Data extends z.ZodType>(activityId: Id, data: Data) =>
  z.object({ activityId: z.literal(activityId), data });

export const rawResultSchema = z.discriminatedUnion('activityId', [
  rawResultMember('finger-tapping', fingerTappingRawResultSchema),
  rawResultMember('shoulder-raise', shoulderRaiseRawResultSchema),
  rawResultMember('sit-to-stand', sitToStandRawResultSchema),
  rawResultMember('single-leg-squat', singleLegSquatRawResultSchema),
  rawResultMember('check-in-pain', painCheckInSchema),
  rawResultMember('check-in-medication', medicationCheckInSchema),
  rawResultMember('check-in-episodes', episodesCheckInSchema),
]);

export type RawResult = z.infer<typeof rawResultSchema>;
