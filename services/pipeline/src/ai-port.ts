import type { ActivityId, AiOutput, MetricId, SessionSummary, Side } from '@tempo/shared';
import type { Ai, SessionSummaryInput } from './ai/index.ts';

export type { SessionSummaryInput };

export type ItemScoringInput = { activityId: ActivityId; data: unknown };

export type ItemScoringOutput = { scores: { metricId: MetricId; side?: Side; value: number }[] };

export type PipelineAi = {
  summarizeSession(input: SessionSummaryInput): Promise<AiOutput<SessionSummary>>;
  scoreItem(input: ItemScoringInput): Promise<AiOutput<ItemScoringOutput> | undefined>;
};

export const aiScoredActivities: ReadonlySet<ActivityId> = new Set<ActivityId>(['clock-drawing', 'word-recall']);

export const createPipelineAi = (ai: Ai): PipelineAi => ({
  summarizeSession: (input) => ai.summarizeSession(input, `session:${input.sessionId}`),
  scoreItem: async () => undefined,
});
