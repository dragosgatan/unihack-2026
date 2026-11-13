import { z } from 'zod';
import { activityIdSchema, skipReasonSchema, skipStageSchema } from './activity.ts';
import { idSchema, isoDateTimeSchema, sideSchema } from './common.ts';
import { metricIdSchema, referenceBandSchema } from './metrics.ts';
import { scoreSchema } from './session.ts';
import { aiMetaSchema } from './ai.ts';

export const reportSkipSchema = z.object({
  resultId: idSchema,
  activityId: activityIdSchema,
  reason: skipReasonSchema,
  stage: skipStageSchema,
  skippedAt: isoDateTimeSchema,
  painLocation: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});

export const reportScoreSchema = z.object({
  resultId: idSchema,
  activityId: activityIdSchema,
  metricId: metricIdSchema,
  side: sideSchema.optional(),
  value: z.number(),
  unit: z.string().min(1),
  scoredBy: scoreSchema.shape.scoredBy,
  baseline: z.number().nullable(),
  referenceBand: referenceBandSchema.nullable(),
  flagged: z.boolean(),
});

export const reportAiSummarySchema = z.object({
  label: z.literal('ai-generated'),
  summary: z.string().min(1),
  claims: z.array(z.object({ text: z.string().min(1), metricId: metricIdSchema })),
  ai: aiMetaSchema,
});

export const reportAiItemSchema = z.object({
  resultId: idSchema,
  ai: aiMetaSchema,
});

export const sessionReportSchema = z.object({
  sessionId: idSchema,
  patientId: idSchema,
  generatedAt: isoDateTimeSchema,
  skipped: z.array(reportSkipSchema),
  scores: z.array(reportScoreSchema),
  aiItems: z.array(reportAiItemSchema),
  aiSummary: reportAiSummarySchema,
  notifiedAt: isoDateTimeSchema.optional(),
});

export type ReportSkip = z.infer<typeof reportSkipSchema>;
export type ReportScore = z.infer<typeof reportScoreSchema>;
export type ReportAiSummary = z.infer<typeof reportAiSummarySchema>;
export type ReportAiItem = z.infer<typeof reportAiItemSchema>;
export type SessionReport = z.infer<typeof sessionReportSchema>;
