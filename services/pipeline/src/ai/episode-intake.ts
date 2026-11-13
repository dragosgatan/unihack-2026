import { episodeDraftSchema, type AiOutput, type EpisodeDraft, type Language } from '@tempo/shared';
import { deidentify } from './deidentify.ts';
import { generate, type GenerateContext } from './generate.ts';
import { clinicianOnlyRules, type AiPart, type Media } from './provider.ts';
import { languageNames } from './language.ts';

export const episodeIntakePromptVersion = 'episode-intake-1';

const systemFor = (language: Language): string =>
  [
    'A patient in a rehabilitation programme describes an episode in their own words. Turn it into a structured entry for their clinician.',
    'type: the closest of the allowed episode types.',
    'when: when it happened, as the patient said it.',
    'severity: only if the patient says how bad it was.',
    'circumstances: one or two sentences on what the patient was doing and what happened, in their words.',
    `The patient speaks ${languageNames[language]}. Write when and circumstances in that language.`,
    clinicianOnlyRules,
  ].join('\n');

export type IntakeEpisodeInput = { language: Language; inputRef: string } & (
  | { audio: Media }
  | { transcript: string; identifiers: readonly string[] }
);

const descriptionPart = (input: IntakeEpisodeInput): AiPart =>
  'audio' in input ? input.audio : { text: deidentify.text(input.transcript, input.identifiers) };

export const intakeEpisode = (context: GenerateContext, input: IntakeEpisodeInput): Promise<AiOutput<EpisodeDraft>> =>
  generate(context, {
    task: 'episode-intake',
    promptVersion: episodeIntakePromptVersion,
    inputRef: input.inputRef,
    system: systemFor(input.language),
    parts: [descriptionPart(input)],
    responseSchema: episodeDraftSchema,
  });
