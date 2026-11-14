import { z } from 'zod';
import { episodesCheckInSchema, medicationCheckInSchema, painCheckInSchema } from './checkin.ts';
import { idSchema, isoDateTimeSchema, languageSchema, sideSchema, type Language } from './common.ts';
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

export const trailMakingTargetSchema = z.object({
  label: z.string().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const trailMakingTapSchema = z.object({
  t: z.number().nonnegative(),
  target: z.number().int().nonnegative(),
});

export const trailMakingRawResultSchema = z
  .object({
    hand: sideSchema,
    targets: z.array(trailMakingTargetSchema).min(2),
    taps: z.array(trailMakingTapSchema),
  })
  .refine((raw) => raw.taps.every((tap) => tap.target < raw.targets.length), 'A tap points at a target that does not exist');

export type TrailMakingTarget = z.infer<typeof trailMakingTargetSchema>;
export type TrailMakingTap = z.infer<typeof trailMakingTapSchema>;
export type TrailMakingRawResult = z.infer<typeof trailMakingRawResultSchema>;

const unitInterval = z.number().min(0).max(1);

export const clockDrawingPointSchema = z.object({
  t: z.number().nonnegative(),
  x: unitInterval,
  y: unitInterval,
});

export const clockTimeSchema = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/);

export const clockDrawingRawResultSchema = z.object({
  hand: sideSchema,
  targetTime: clockTimeSchema,
  strokes: z.array(z.array(clockDrawingPointSchema).min(1)),
});

export type ClockDrawingPoint = z.infer<typeof clockDrawingPointSchema>;
export type ClockDrawingRawResult = z.infer<typeof clockDrawingRawResultSchema>;

export const spiralTracingRawResultSchema = z.object({
  hand: sideSchema,
  sizeMm: z.number().positive(),
  strokes: z.array(z.array(clockDrawingPointSchema).min(1)),
});

export type SpiralTracingRawResult = z.infer<typeof spiralTracingRawResultSchema>;

export const wordRecallPartSchema = z.enum(['immediate', 'delayed']);

export const wordRecallRecordingSchema = z.object({
  id: z.string().min(1),
  mimeType: z.string().min(1),
  durationMs: z.number().nonnegative(),
  bytes: z.number().int().nonnegative(),
});

export const wordRecallRawResultSchema = z.object({
  part: wordRecallPartSchema,
  language: languageSchema,
  words: z.array(z.string().min(1)).length(5),
  presentedAt: isoDateTimeSchema,
  recording: wordRecallRecordingSchema,
});

export const wordRecallDelayedConfigSchema = wordRecallRawResultSchema
  .pick({ language: true, words: true, presentedAt: true })
  .extend({ part: z.literal('delayed') });

export type WordRecallPart = z.infer<typeof wordRecallPartSchema>;
export type WordRecallRecording = z.infer<typeof wordRecallRecordingSchema>;
export type WordRecallRawResult = z.infer<typeof wordRecallRawResultSchema>;
export type WordRecallDelayedConfig = z.infer<typeof wordRecallDelayedConfigSchema>;

export const medicationCheckInConfigSchema = z.object({
  medications: z.array(z.object({ medicationId: idSchema, name: z.string().min(1) })),
});

export type MedicationCheckInConfig = z.infer<typeof medicationCheckInConfigSchema>;

const rawResultMember = <Id extends ActivityId, Data extends z.ZodType>(activityId: Id, data: Data) =>
  z.object({ activityId: z.literal(activityId), data });

export const rawResultSchema = z.discriminatedUnion('activityId', [
  rawResultMember('finger-tapping', fingerTappingRawResultSchema),
  rawResultMember('trail-making-a', trailMakingRawResultSchema),
  rawResultMember('trail-making-b', trailMakingRawResultSchema),
  rawResultMember('clock-drawing', clockDrawingRawResultSchema),
  rawResultMember('spiral-tracing', spiralTracingRawResultSchema),
  rawResultMember('word-recall', wordRecallRawResultSchema),
  rawResultMember('shoulder-raise', shoulderRaiseRawResultSchema),
  rawResultMember('sit-to-stand', sitToStandRawResultSchema),
  rawResultMember('single-leg-squat', singleLegSquatRawResultSchema),
  rawResultMember('check-in-pain', painCheckInSchema),
  rawResultMember('check-in-medication', medicationCheckInSchema),
  rawResultMember('check-in-episodes', episodesCheckInSchema),
]);

export type RawResult = z.infer<typeof rawResultSchema>;
