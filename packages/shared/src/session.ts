import { z } from 'zod';
import {
  activityIdSchema,
  activityKindSchema,
  rawResultSchema,
  skipReasonSchema,
  skipStageSchema,
} from './activity.ts';
import { idSchema, isoDateTimeSchema, languageSchema, sideSchema } from './common.ts';
import { metricIdSchema } from './metrics.ts';

export const sessionPlanItemSchema = z.object({
  activityId: activityIdSchema,
  kind: activityKindSchema,
  config: z.record(z.string(), z.unknown()),
  targetRepetitions: z.number().int().positive().optional(),
  targetAngle: z.number().min(0).max(180).optional(),
  side: sideSchema.optional(),
});

export const sessionPlanSchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  changeReason: z.string().min(1).optional(),
  patientId: idSchema,
  items: z.array(sessionPlanItemSchema).min(1),
  schedule: z.object({ sessions: z.number().int().min(1).max(14), per: z.enum(['week', 'month']) }),
  language: languageSchema,
  createdBy: idSchema,
  updatedAt: isoDateTimeSchema,
});

export const sessionModeSchema = z.enum(['kiosk', 'home']);
export const sessionStatusSchema = z.enum([
  'created',
  'in-progress',
  'submitted',
  'processed',
  'completed-with-skips',
]);

export const sessionSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  planId: idSchema,
  planVersion: z.number().int().positive(),
  mode: sessionModeSchema,
  status: sessionStatusSchema,
  partial: z.boolean(),
  startedBy: idSchema.optional(),
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.optional(),
  submittedAt: isoDateTimeSchema.optional(),
});

export const scoreSchema = z.object({
  metricId: metricIdSchema,
  value: z.number(),
  side: sideSchema.optional(),
  scoredBy: z.enum(['code', 'ai', 'clinician']),
});

export const completedResultSchema = z.object({
  status: z.literal('completed'),
  raw: rawResultSchema,
  completedAt: isoDateTimeSchema,
});

export const skippedResultSchema = z.object({
  status: z.literal('skipped'),
  activityId: activityIdSchema,
  reason: skipReasonSchema,
  stage: skipStageSchema,
  skippedAt: isoDateTimeSchema,
  painLocation: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
  partialData: z.unknown().optional(),
});

export const submittedResultSchema = z.discriminatedUnion('status', [completedResultSchema, skippedResultSchema]);

const storedResultFields = { id: idSchema, sessionId: idSchema, patientId: idSchema };

export const activityResultSchema = z.discriminatedUnion('status', [
  completedResultSchema.extend({ ...storedResultFields, scores: z.array(scoreSchema).optional() }),
  skippedResultSchema.extend(storedResultFields),
]);

export type SessionPlanItem = z.infer<typeof sessionPlanItemSchema>;
export type SessionPlan = z.infer<typeof sessionPlanSchema>;
export type SessionMode = z.infer<typeof sessionModeSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Score = z.infer<typeof scoreSchema>;
export type CompletedResult = z.infer<typeof completedResultSchema>;
export type SkippedResult = z.infer<typeof skippedResultSchema>;
export type SubmittedResult = z.infer<typeof submittedResultSchema>;
export type ActivityResult = z.infer<typeof activityResultSchema>;
