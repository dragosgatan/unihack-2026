import type { AiProviderName } from '@tempo/shared';
import type { z } from 'zod';

export type AiTask = 'clock-drawing' | 'speech' | 'session-summary' | 'record-intake' | 'episode-intake' | 'suggestion';

export type Media = { mimeType: string; data: Uint8Array };

export type AiPart = { text: string } | Media;

export type AiRequest = {
  task: AiTask;
  system: string;
  parts: AiPart[];
  responseSchema: z.ZodType;
};

export type AiResponse = { data: unknown; model: string };

export type AiProvider = {
  name: AiProviderName;
  generate: (request: AiRequest) => Promise<AiResponse>;
};

export const clinicianOnlyRules = [
  'Your output is a suggestion for a clinician, who reviews it and decides.',
  'Never diagnose, never recommend or change treatment or medication, and never give medical advice.',
  'Do not include names, dates of birth, addresses or patient identifiers in your output.',
  'Reply only with JSON that matches the response schema.',
].join('\n');
