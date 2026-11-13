import { scoreResult } from '@tempo/shared/scoring';
import { requireSession, type PipelineDeps } from '../ports.ts';
import type { PipelineInput } from '../state.ts';
import { alertPainSkips } from './pain-alert.ts';
import { isCompleted, isSkipped, metricPoints, withScores } from './results.ts';

export const score = async (deps: PipelineDeps, { sessionId }: PipelineInput): Promise<PipelineInput> => {
  const { store } = deps;
  const session = await requireSession(store, sessionId);
  const stored = await store.listResults(sessionId);
  const skipped = stored.filter(isSkipped);
  await alertPainSkips(deps, session, skipped);
  if (skipped.length > 0) await store.setSessionStatus(sessionId, 'completed-with-skips');

  const results = stored.map((result) =>
    isCompleted(result) ? withScores(result, 'code', scoreResult(result.raw)) : result,
  );
  await store.putResults(sessionId, results);
  await store.putMetricValues(metricPoints(session, results, 'code'));
  return { sessionId };
};
