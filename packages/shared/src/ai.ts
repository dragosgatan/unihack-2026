import { z } from 'zod';
import { episodeSchema, episodeTypeSchema } from './checkin.ts';
import { isoDateTimeSchema } from './common.ts';
import { metricIdSchema } from './metrics.ts';
import { diagnosisSchema, medicationSchema } from './record.ts';
import { aiProvenanceSchema } from './suggestion.ts';

export const aiProviderNameSchema = z.enum(['mock', 'gemini']);

export const aiMetaSchema = aiProvenanceSchema.extend({
  provider: aiProviderNameSchema,
  createdAt: isoDateTimeSchema,
});

export const aiOutputSchema = <Output extends z.ZodType>(output: Output) => z.object({ output, meta: aiMetaSchema });

export const clockCriterionScoreSchema = z.object({
  score: z.number().int().min(0).max(1),
  justification: z.string().min(1),
});

export const clockDrawingScoreSchema = z
  .object({
    contour: clockCriterionScoreSchema,
    numbers: clockCriterionScoreSchema,
    hands: clockCriterionScoreSchema,
    total: z.number().int().min(0).max(3),
    confidence: z.number().min(0).max(1),
  })
  .refine((score) => score.total === score.contour.score + score.numbers.score + score.hands.score, {
    message: 'total must equal the sum of the criterion scores',
    path: ['total'],
  });

export const speechTranscriptSchema = z.object({
  transcript: z.string(),
  words: z.array(z.string().min(1)),
});

export const sessionSummarySchema = z.object({
  summary: z.string().min(1),
  claims: z.array(z.object({ text: z.string().min(1), metricId: metricIdSchema })),
});

export const recordDraftSchema = z.object({
  diagnoses: z.array(
    z.object({
      label: diagnosisSchema.shape.label,
      code: diagnosisSchema.shape.code.optional(),
    }),
  ),
  medications: z.array(
    z.object({
      name: medicationSchema.shape.name,
      dose: medicationSchema.shape.dose.optional(),
      frequency: medicationSchema.shape.frequency.optional(),
      startDate: medicationSchema.shape.startDate.optional(),
    }),
  ),
  historyNotes: z.array(z.string().min(1)),
});

export const episodeDraftSchema = z.object({
  type: episodeTypeSchema,
  when: z.string().min(1),
  severity: episodeSchema.shape.severity,
  circumstances: z.string().min(1),
});

export const suggestionDraftSchema = z.object({
  text: z.string().min(1).max(600),
});

export type AiProviderName =z.infer<typeof aiProviderNameSchema>;
export type AiMeta = z.infer<typeof aiMetaSchema>;
export type AiOutput<Output> = { output: Output; meta: AiMeta };
export type ClockCriterionScore = z.infer<typeof clockCriterionScoreSchema>;
export type ClockDrawingScore = z.infer<typeof clockDrawingScoreSchema>;
export type SpeechTranscript = z.infer<typeof speechTranscriptSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type RecordDraft = z.infer<typeof recordDraftSchema>;
export type EpisodeDraft = z.infer<typeof episodeDraftSchema>;
export type SuggestionDraft = z.infer<typeof suggestionDraftSchema>;
