import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.ts';
import { metricIdSchema } from './metrics.ts';

export const aiProvenanceSchema = z.object({
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  inputRef: z.string().min(1),
});

export const suggestionEvidenceSchema = z.object({
  metricId: metricIdSchema.optional(),
  sessionId: idSchema.optional(),
  t: isoDateTimeSchema.optional(),
  label: z.string().min(1),
  sourceUrl: z.url().optional(),
});

export const suggestionStatusSchema = z.enum(['proposed', 'accepted', 'edited', 'dismissed']);

export const suggestionSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  text: z.string().min(1),
  evidence: z.array(suggestionEvidenceSchema),
  status: suggestionStatusSchema,
  editedText: z.string().min(1).optional(),
  decidedBy: idSchema.optional(),
  decidedAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  ai: aiProvenanceSchema,
});

export type AiProvenance = z.infer<typeof aiProvenanceSchema>;
export type SuggestionEvidence = z.infer<typeof suggestionEvidenceSchema>;
export type SuggestionStatus = z.infer<typeof suggestionStatusSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
