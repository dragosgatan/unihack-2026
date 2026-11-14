import { z } from 'zod';
import { sideSchema } from './common.ts';

export const exerciseConfigSchema = z.object({
  side: sideSchema.optional(),
  targetRepetitions: z.number().int().positive().default(10),
  targetAngle: z.number().min(0).max(180).optional(),
});

const repTimes = {
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
};

export const exerciseRepSchema = z.object(repTimes);

export const shoulderRaiseRepSchema = z.object({
  ...repTimes,
  angles: z.array(z.number().min(0).max(180)).min(1),
});

export const shoulderRaiseRawResultSchema = z.object({
  trials: z.array(z.object({ side: sideSchema, reps: z.array(shoulderRaiseRepSchema) })).min(1),
});

export const sitToStandRawResultSchema = z.object({
  durationMs: z.number().positive(),
  reps: z.array(exerciseRepSchema),
});

export const singleLegSquatRepSchema = z.object({
  ...repTimes,
  kneeFlexion: z.number().min(0).max(180),
  depth: z.number().min(0).max(100),
  valgus: z.number().min(0).max(180),
});

export const singleLegSquatRawResultSchema = z.object({
  trials: z.array(z.object({ side: sideSchema, reps: z.array(singleLegSquatRepSchema) })).min(1),
});

export type ExerciseConfig = z.infer<typeof exerciseConfigSchema>;
export type ExerciseRep = z.infer<typeof exerciseRepSchema>;
export type ShoulderRaiseRep = z.infer<typeof shoulderRaiseRepSchema>;
export type ShoulderRaiseRawResult = z.infer<typeof shoulderRaiseRawResultSchema>;
export type SitToStandRawResult = z.infer<typeof sitToStandRawResultSchema>;
export type SingleLegSquatRep = z.infer<typeof singleLegSquatRepSchema>;
export type SingleLegSquatRawResult = z.infer<typeof singleLegSquatRawResultSchema>;
