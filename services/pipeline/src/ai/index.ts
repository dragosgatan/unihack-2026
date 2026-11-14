import { aiProviderNameSchema } from '@tempo/shared';
import { scoreClockDrawing, type ScoreClockDrawingInput } from './clock-drawing.ts';
import { intakeEpisode, type IntakeEpisodeInput } from './episode-intake.ts';
import { createGeminiProvider } from './gemini-provider.ts';
import { createMockProvider } from './mock-provider.ts';
import type { AiProvider } from './provider.ts';
import { intakeRecord, type IntakeRecordInput } from './record-intake.ts';
import { secretsManagerString } from './secret.ts';
import { summarizeSession, type SessionSummaryInput } from './session-summary.ts';
import { transcribeSpeech, type TranscribeSpeechInput } from './speech.ts';
import { suggestReview, type SuggestReviewInput } from './suggest-review.ts';

export { AiOutputInvalidError } from './generate.ts';
export { GeminiRequestError, createGeminiProvider, geminiModel } from './gemini-provider.ts';
export { createMockProvider } from './mock-provider.ts';
export { clockRubric } from './clock-drawing.ts';
export type { AiPart, AiProvider, AiRequest, AiResponse, AiTask, Media } from './provider.ts';
export type {
  IntakeEpisodeInput,
  IntakeRecordInput,
  ScoreClockDrawingInput,
  SessionSummaryInput,
  SuggestReviewInput,
  TranscribeSpeechInput,
};
export { sessionSummaryInputSchema } from './session-summary.ts';
export { suggestReviewInputSchema, suggestReviewPromptVersion } from './suggest-review.ts';

export const createAi = ({ provider, now = () => new Date() }: { provider: AiProvider; now?: () => Date }) => {
  const context = { provider, now };
  return {
    scoreClockDrawing: (input: ScoreClockDrawingInput) => scoreClockDrawing(context, input),
    transcribeSpeech: (input: TranscribeSpeechInput) => transcribeSpeech(context, input),
    summarizeSession: (input: SessionSummaryInput, inputRef: string) => summarizeSession(context, input, inputRef),
    intakeRecord: (input: IntakeRecordInput) => intakeRecord(context, input),
    intakeEpisode: (input: IntakeEpisodeInput) => intakeEpisode(context, input),
    suggestReview: (input: SuggestReviewInput) => suggestReview(context, input),
  };
};

export type Ai = ReturnType<typeof createAi>;

export const providerFromEnv = (env: NodeJS.ProcessEnv = process.env): AiProvider => {
  const name = aiProviderNameSchema.parse(env.AI_PROVIDER ?? 'mock');
  if (name === 'mock') return createMockProvider();
  const secretArn = env.GEMINI_SECRET_ARN;
  if (!secretArn) throw new Error('GEMINI_SECRET_ARN is required when AI_PROVIDER is gemini');
  return createGeminiProvider({ apiKey: secretsManagerString(secretArn) });
};

export const aiFromEnv = (env: NodeJS.ProcessEnv = process.env): Ai => createAi({ provider: providerFromEnv(env) });
