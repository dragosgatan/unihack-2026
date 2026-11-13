import { z } from 'zod';
import {
  deviceSessionCodeResponseSchema,
  submittedResultSchema,
  type ActivityId,
  type DeviceSessionCodeResponse,
  type SubmitSessionRequest,
  type SubmittedResult,
} from '@tempo/shared';

export const runnerStateSchema = deviceSessionCodeResponseSchema.extend({
  stage: z.enum(['welcome', 'activity', 'between', 'paused']),
  index: z.number().int().nonnegative(),
  results: z.array(submittedResultSchema),
});

export type RunnerState = z.infer<typeof runnerStateSchema>;
export type Stage = RunnerState['stage'];

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

export const isFinished = (state: RunnerState) => state.index >= state.plan.items.length;

export const submission = (state: RunnerState): SubmitSessionRequest => ({
  partial: !isFinished(state),
  results: state.results,
});
