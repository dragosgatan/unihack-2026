import {
  clockDrawingRawResultSchema,
  type ActivityId,
  type AiOutput,
  type MetricId,
  type SessionSummary,
  type Side,
  type SuggestionDraft,
} from '@tempo/shared';
import { clockDrawingFeatures } from '@tempo/shared/scoring';
import type { Ai, SessionSummaryInput, SuggestReviewInput } from './ai/index.ts';
import { clockDrawingPng } from './clock-image.ts';

export type { SessionSummaryInput, SuggestReviewInput };

export type ItemScoringInput = { activityId: ActivityId; data: unknown; inputRef: string };

export type ItemScoringOutput = { scores: { metricId: MetricId; side?: Side; value: number }[] };

export type PipelineAi = {
  summarizeSession(input: SessionSummaryInput): Promise<AiOutput<SessionSummary>>;
  scoreItem(input: ItemScoringInput): Promise<AiOutput<ItemScoringOutput> | undefined>;
  suggestReview(input: SuggestReviewInput): Promise<AiOutput<SuggestionDraft>>;
};

export const aiScoredActivities: ReadonlySet<ActivityId> = new Set<ActivityId>(['clock-drawing', 'word-recall']);

const scoreClock = async (ai: Ai, { data, inputRef }: ItemScoringInput): Promise<AiOutput<ItemScoringOutput> | undefined> => {
  const raw = clockDrawingRawResultSchema.safeParse(data);
  if (!raw.success || clockDrawingFeatures(raw.data) === undefined) return undefined;
  const { output, meta } = await ai.scoreClockDrawing({
    image: { mimeType: 'image/png', data: clockDrawingPng(raw.data.strokes) },
    targetTime: raw.data.targetTime,
    inputRef,
  });
  return { output: { scores: [{ metricId: 'clock-drawing.score', value: output.total }] }, meta };
};

export const createPipelineAi = (ai: Ai): PipelineAi => ({
  summarizeSession: (input) => ai.summarizeSession(input, `session:${input.sessionId}`),
  scoreItem: async (input) => (input.activityId === 'clock-drawing' ? scoreClock(ai, input) : undefined),
  suggestReview: (input) => ai.suggestReview(input),
});
