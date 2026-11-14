import {
  idSchema,
  isoDateSchema,
  languageSchema,
  metricIdSchema,
  sideSchema,
  suggestionDraftSchema,
  type AiOutput,
  type SuggestionDraft,
} from '@tempo/shared';
import { z } from 'zod';
import { deidentify } from './deidentify.ts';
import { generate, type GenerateContext } from './generate.ts';
import { languageNames } from './language.ts';
import { clinicianOnlyRules } from './provider.ts';

export const suggestReviewPromptVersion = 'suggest-review-1';

export const medicationChangeKindSchema = z.enum(['started', 'stopped', 'dose-changed']);

export const suggestReviewSentSchema = z.object({
  metricId: metricIdSchema,
  side: sideSchema.optional(),
  direction: z.enum(['higher', 'lower']),
  value: z.number(),
  baseline: z.number(),
  sessionDate: isoDateSchema,
  medication: z.object({
    name: z.string().min(1),
    change: medicationChangeKindSchema,
    date: isoDateSchema,
  }),
  labelTerms: z.array(z.string().min(1)).min(1),
});

export const suggestReviewInputSchema = suggestReviewSentSchema.extend({
  suggestionId: idSchema,
  language: languageSchema,
});

export type SuggestReviewInput = z.infer<typeof suggestReviewInputSchema>;

const systemFor = (language: SuggestReviewInput['language']): string =>
  [
    'You write one review suggestion for the clinician who follows a patient in rehabilitation.',
    `Write in ${languageNames[language]}.`,
    'Write one or two sentences in the text field.',
    'State that the change in the metric, measured in the session on sessionDate, coincides with the medication change on its date, and that the drug label lists labelTerms among its adverse reactions or warnings.',
    'State only that the two coincide in time. Never say or imply that the medication caused the change.',
    'End with wording that asks the clinician to consider a review, such as "consider review".',
    'Never suggest starting, stopping or changing a medication or a dose.',
    clinicianOnlyRules,
  ].join('\n');

export const suggestReview = (context: GenerateContext, input: SuggestReviewInput): Promise<AiOutput<SuggestionDraft>> =>
  generate(context, {
    task: 'suggestion',
    promptVersion: suggestReviewPromptVersion,
    inputRef: `suggestion:${input.suggestionId}`,
    system: systemFor(input.language),
    parts: [{ text: JSON.stringify(deidentify.fields(suggestReviewSentSchema, input)) }],
    responseSchema: suggestionDraftSchema,
  });
