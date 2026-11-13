import { z } from 'zod';
import { activityIdSchema, skipReasonSchema, skipStageSchema } from './activity.ts';
import { idSchema, isoDateTimeSchema, sideSchema } from './common.ts';
import { metricIdSchema } from './metrics.ts';

export const flagKindSchema = z.enum(['reliable-change', 'pain-skip', 'repeated-skip']);

export const reliableChangeFlagSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  sessionId: idSchema,
  metricId: metricIdSchema,
  side: sideSchema.optional(),
  kind: z.literal('reliable-change'),
  value: z.number(),
  baseline: z.number(),
  createdAt: isoDateTimeSchema,
});

export const painSkipFlagSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  sessionId: idSchema,
  kind: z.literal('pain-skip'),
  activityId: activityIdSchema,
  stage: skipStageSchema,
  painLocation: z.string().min(1).optional(),
  createdAt: isoDateTimeSchema,
});

export const repeatedSkipFlagSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  sessionId: idSchema,
  kind: z.literal('repeated-skip'),
  activityId: activityIdSchema,
  previousSessionId: idSchema,
  reason: skipReasonSchema,
  createdAt: isoDateTimeSchema,
});

export const skipFlagSchema = z.discriminatedUnion('kind', [painSkipFlagSchema, repeatedSkipFlagSchema]);

export const flagSchema = z.discriminatedUnion('kind', [
  reliableChangeFlagSchema,
  painSkipFlagSchema,
  repeatedSkipFlagSchema,
]);

export type FlagKind = z.infer<typeof flagKindSchema>;
export type ReliableChangeFlag = z.infer<typeof reliableChangeFlagSchema>;
export type PainSkipFlag = z.infer<typeof painSkipFlagSchema>;
export type RepeatedSkipFlag = z.infer<typeof repeatedSkipFlagSchema>;
export type SkipFlag = z.infer<typeof skipFlagSchema>;
export type Flag = z.infer<typeof flagSchema>;
