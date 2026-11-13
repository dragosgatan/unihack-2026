import { z } from 'zod';
import {
  activityIdSchema,
  idSchema,
  isoDateTimeSchema,
  metricIdSchema,
  referenceBandSchema,
  reportAiItemSchema,
  scoreSchema,
  sideSchema,
} from '@tempo/shared';

export const pipelineInputSchema = z.object({ sessionId: idSchema });

export const aiItemsStateSchema = pipelineInputSchema.extend({ aiItems: z.array(reportAiItemSchema) });

export const comparisonSchema = z.object({
  resultId: idSchema,
  activityId: activityIdSchema,
  metricId: metricIdSchema,
  side: sideSchema.optional(),
  value: z.number(),
  t: isoDateTimeSchema,
  scoredBy: scoreSchema.shape.scoredBy,
  baseline: z.number().nullable(),
  referenceBand: referenceBandSchema.nullable(),
  previous: z.number().nullable(),
});

export const compareStateSchema = aiItemsStateSchema.extend({ comparisons: z.array(comparisonSchema) });

export type PipelineInput = z.infer<typeof pipelineInputSchema>;
export type AiItemsState = z.infer<typeof aiItemsStateSchema>;
export type Comparison = z.infer<typeof comparisonSchema>;
export type CompareState = z.infer<typeof compareStateSchema>;
