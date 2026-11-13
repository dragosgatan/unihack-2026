import { scoreResult } from '@tempo/shared/scoring';
import { requireSession, type PipelineDeps } from '../ports.ts';
import type { PipelineInput } from '../state.ts';
import { isCompleted, metricPoints, withScores } from './results.ts';

export const score = async ({ store }: PipelineDeps, { sessionId }: PipelineInput): Promise<PipelineInput> => {
  const session = await requireSession(store, sessionId);
  const results = (await store.listResults(sessionId)).map((result) =>
    isCompleted(result) ? withScores(result, 'code', scoreResult(result.raw)) : result,
  );
  await store.putResults(sessionId, results);
  await store.putMetricValues(metricPoints(session, results, 'code'));
  return { sessionId };
};
