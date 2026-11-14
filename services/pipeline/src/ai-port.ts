import {
  clockDrawingRawResultSchema,
  wordRecallRawResultSchema,
  type ActivityId,
  type AiOutput,
  type MetricId,
  type SessionSummary,
  type Side,
  type SuggestionDraft,
} from '@tempo/shared';
import { clockDrawingFeatures, scoreWordRecall } from '@tempo/shared/scoring';
import type { Ai, SessionSummaryInput, SuggestReviewInput } from './ai/index.ts';
import { clockDrawingPng } from './clock-image.ts';
import type { RecordingReader } from './ports.ts';
import { recordingKey } from './recording-files.ts';

export type { SessionSummaryInput, SuggestReviewInput };

export type ItemScoringInput = { activityId: ActivityId; sessionId: string; data: unknown; inputRef: string };

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

const scoreWords = async (
  ai: Ai,
  recordings: RecordingReader,
  { sessionId, data, inputRef }: ItemScoringInput,
): Promise<AiOutput<ItemScoringOutput> | undefined> => {
  const raw = wordRecallRawResultSchema.safeParse(data);
  if (!raw.success) return undefined;
  const recording = await recordings.get(recordingKey(sessionId, raw.data.recording.id));
  if (!recording || recording.bytes.length === 0) return undefined;
  const { output, meta } = await ai.transcribeSpeech({
    audio: { mimeType: recording.mimeType, data: recording.bytes },
    language: raw.data.language,
    inputRef,
  });
  const scores = scoreWordRecall(raw.data, output.words).map(({ metricId, value }) => ({ metricId, value }));
  return { output: { scores }, meta };
};

export const createPipelineAi = (ai: Ai, recordings: RecordingReader): PipelineAi => ({
  summarizeSession: (input) => ai.summarizeSession(input, `session:${input.sessionId}`),
  scoreItem: async (input) => {
    if (input.activityId === 'clock-drawing') return scoreClock(ai, input);
    if (input.activityId === 'word-recall') return scoreWords(ai, recordings, input);
    return undefined;
  },
  suggestReview: (input) => ai.suggestReview(input),
});
