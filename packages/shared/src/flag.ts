import { z } from 'zod';
import { idSchema, isoDateTimeSchema, sideSchema } from './common.ts';
import { metricIdSchema } from './metrics.ts';

export const flagKindSchema = z.enum(['reliable-change']);

export const flagSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  sessionId: idSchema,
  metricId: metricIdSchema,
  side: sideSchema.optional(),
  kind: flagKindSchema,
  value: z.number(),
  baseline: z.number(),
  createdAt: isoDateTimeSchema,
});

export type FlagKind = z.infer<typeof flagKindSchema>;
export type Flag = z.infer<typeof flagSchema>;
