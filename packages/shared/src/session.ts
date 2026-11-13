import { z } from 'zod';
import { activityIdSchema, activityKindSchema, rawResultSchema } from './activity.ts';
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
  patientId: idSchema,
  items: z.array(sessionPlanItemSchema).min(1),
  schedule: z.object({ sessionsPerWeek: z.number().int().min(1).max(14) }),
  language: languageSchema,
  createdBy: idSchema,
  updatedAt: isoDateTimeSchema,
});

export const sessionModeSchema = z.enum(['kiosk', 'home']);
export const sessionStatusSchema = z.enum(['created', 'in-progress', 'submitted', 'processed']);

export const sessionSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  planId: idSchema,
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

export const activityResultSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  patientId: idSchema,
  raw: rawResultSchema,
  completedAt: isoDateTimeSchema,
  scores: z.array(scoreSchema).optional(),
});

export type SessionPlanItem = z.infer<typeof sessionPlanItemSchema>;
export type SessionPlan = z.infer<typeof sessionPlanSchema>;
export type SessionMode = z.infer<typeof sessionModeSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Score = z.infer<typeof scoreSchema>;
export type ActivityResult = z.infer<typeof activityResultSchema>;
