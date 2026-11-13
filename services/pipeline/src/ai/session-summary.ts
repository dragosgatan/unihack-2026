import {
  activityIdSchema,
  idSchema,
  languageSchema,
  metricIdSchema,
  sessionSummarySchema,
  sideSchema,
  skipReasonSchema,
  skipStageSchema,
  type AiOutput,
  type SessionSummary,
} from '@tempo/shared';
import { z } from 'zod';
import { deidentify } from './deidentify.ts';
import { generate, type GenerateContext } from './generate.ts';
import { clinicianOnlyRules } from './provider.ts';
import { languageNames } from './language.ts';

export const sessionSummaryPromptVersion = 'session-summary-1';

const sentToModelSchema = z.object({
  scores: z.array(
    z.object({
      metricId: metricIdSchema,
      side: sideSchema.optional(),
      value: z.number(),
      unit: z.string(),
      baseline: z.number().nullable(),
      flagged: z.boolean(),
    }),
  ),
  skipped: z.array(
    z.object({
      activityId: activityIdSchema,
      reason: skipReasonSchema,
      stage: skipStageSchema,
    }),
  ),
});

export const sessionSummaryInputSchema = sentToModelSchema.extend({
  sessionId: idSchema,
  language: languageSchema,
});

export type SessionSummaryInput = z.infer<typeof sessionSummaryInputSchema>;

const systemFor = (language: SessionSummaryInput['language']): string =>
  [
    'You write a short plain-language summary of one rehabilitation session for the clinician who runs it.',
    `Write in ${languageNames[language]}.`,
    'Mention skipped activities first, with their reason and the stage at which they were stopped. A skipped activity has no score and is not a zero.',
    'Then describe the scores against their baselines. A baseline of null means there is no baseline yet. Flagged scores changed more than expected.',
    'Describe only what the data shows. Do not guess causes.',
    'Every claim in claims must be one sentence of the summary that is about exactly one metric, with that metricId.',
    clinicianOnlyRules,
  ].join('\n');

export const summarizeSession = (
  context: GenerateContext,
  input: SessionSummaryInput,
  inputRef: string,
): Promise<AiOutput<SessionSummary>> =>
  generate(context, {
    task: 'session-summary',
    promptVersion: sessionSummaryPromptVersion,
    inputRef,
    system: systemFor(input.language),
    parts: [{ text: JSON.stringify(deidentify.fields(sentToModelSchema, input)) }],
    responseSchema: sessionSummarySchema,
  });
