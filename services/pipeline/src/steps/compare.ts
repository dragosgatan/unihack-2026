import { initialBaseline, initialBaselineSessions, ownRange, type Score } from '@tempo/shared';
import { requireSession, sideOf, type PipelineStore, type PipelineDeps } from '../ports.ts';
import type { AiItemsState, CompareState, Comparison } from '../state.ts';
import { isCompleted, type CompletedActivityResult } from './results.ts';

const compareScore = async (
  store: PipelineStore,
  patientId: string,
  result: CompletedActivityResult,
  score: Score,
): Promise<Comparison> => {
  const { metricId, side, value, scoredBy } = score;
  const t = result.completedAt;
  const [set, first, previous] = await Promise.all([
    store.baselineAt(patientId, metricId, side, t),
    store.firstPoints(patientId, metricId, side, initialBaselineSessions),
    store.previousPoint(patientId, metricId, side, t),
  ]);
  const baseline = set?.value ?? initialBaseline(first);
  return {
    resultId: result.id,
    activityId: result.raw.activityId,
    metricId,
    ...sideOf(side),
    value,
    t,
    scoredBy,
    baseline,
    referenceBand: baseline === null ? null : ownRange(metricId, baseline),
    previous: previous?.value ?? null,
  };
};

export const compare = async ({ store }: PipelineDeps, state: AiItemsState): Promise<CompareState> => {
  const session = await requireSession(store, state.sessionId);
  const results = (await store.listResults(state.sessionId)).filter(isCompleted);
  const comparisons = await Promise.all(
    results.flatMap((result) =>
      (result.scores ?? []).map((score) => compareScore(store, session.patientId, result, score)),
    ),
  );
  return { ...state, comparisons };
};
