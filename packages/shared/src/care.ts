import { z } from 'zod';
import { idSchema, isoDateSchema, isoDateTimeSchema, sideSchema } from './common.ts';
import { metricIdSchema } from './metrics.ts';

export const courseOfCareStatusSchema = z.enum(['active', 'paused', 'discharged']);

export const courseOfCareSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  status: courseOfCareStatusSchema,
  startedAt: isoDateSchema,
  endedAt: isoDateSchema.optional(),
  reason: z.string().min(1),
  outcome: z.string().min(1).optional(),
  updatedAt: isoDateTimeSchema,
  updatedBy: idSchema,
});

export const baselineSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  metricId: metricIdSchema,
  side: sideSchema.optional(),
  value: z.number(),
  from: isoDateTimeSchema,
  source: z.enum(['initial', 'clinician']),
  reason: z.string().min(1).optional(),
  setBy: idSchema.optional(),
});

export type CourseOfCareStatus = z.infer<typeof courseOfCareStatusSchema>;
export type CourseOfCare = z.infer<typeof courseOfCareSchema>;
export type Baseline = z.infer<typeof baselineSchema>;
