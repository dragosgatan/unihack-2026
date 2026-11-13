import { z } from 'zod';
import {
  deviceSessionCodeResponseSchema,
  skipStageSchema,
  submittedResultSchema,
  type ActivityId,
  type DeviceSessionCodeResponse,
  type SkippedResult,
  type SubmitSessionRequest,
  type SubmittedResult,
} from '@tempo/shared';

const progressSchema = z.object({ stage: skipStageSchema, partialData: z.unknown().optional() });

export const runnerStateSchema = deviceSessionCodeResponseSchema.extend({
  stage: z.enum(['welcome', 'activity', 'cannot-do', 'skipped', 'between', 'paused']),
  index: z.number().int().nonnegative(),
  results: z.array(submittedResultSchema),
  pendingSkip: progressSchema.optional(),
});

export type RunnerState = z.infer<typeof runnerStateSchema>;
export type Stage = RunnerState['stage'];
export type ActivityProgress = z.infer<typeof progressSchema>;
export type SkipAnswer = Pick<SkippedResult, 'reason' | 'painLocation' | 'note'>;

export const startRunner = (redeemed: DeviceSessionCodeResponse): RunnerState => ({
  ...redeemed,
  stage: 'welcome',
  index: 0,
  results: [],
});

export const restoreRunner = (state: RunnerState): RunnerState =>
  state.stage === 'activity' ? { ...state, stage: 'paused' } : state;

export const completedResult = (activityId: ActivityId, data: unknown, completedAt: Date): SubmittedResult | undefined => {
  const parsed = submittedResultSchema.safeParse({
    status: 'completed',
    raw: { activityId, data },
    completedAt: completedAt.toISOString(),
  });
  return parsed.success ? parsed.data : undefined;
};

export const completeActivity = (state: RunnerState, result: SubmittedResult | undefined): RunnerState => ({
  ...state,
  stage: 'between',
  index: state.index + 1,
  results: result ? [...state.results, result] : state.results,
});

export const cannotDo = (state: RunnerState, progress: ActivityProgress): RunnerState => ({
  ...state,
  stage: 'cannot-do',
  pendingSkip: progress,
});

export const skipActivity = (state: RunnerState, answer: SkipAnswer, skippedAt: Date): RunnerState => {
  const { pendingSkip, ...rest } = state;
  const item = state.plan.items[state.index];
  const parsed = submittedResultSchema.safeParse({
    status: 'skipped',
    activityId: item?.activityId,
    ...answer,
    stage: pendingSkip?.stage,
    partialData: pendingSkip?.partialData,
    skippedAt: skippedAt.toISOString(),
  });
  if (!parsed.success) console.warn(`Skip of ${item?.activityId} failed validation and was not saved`);
  return { ...completeActivity(rest, parsed.data), stage: 'skipped' };
};

export const isFinished = (state: RunnerState) => state.index >= state.plan.items.length;

export const submission = (state: RunnerState): SubmitSessionRequest => ({
  partial: !isFinished(state),
  results: state.results,
});
