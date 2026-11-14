import type { ActivityResult, ReportAiItem } from '@tempo/shared';
import { aiScoredActivities } from '../ai-port.ts';
import { requireSession, sideOf, type PipelineDeps } from '../ports.ts';
import type { AiItemsState, PipelineInput } from '../state.ts';
import { isCompleted, metricPoints, withScores } from './results.ts';

export const aiItems = async ({ store, ai }: PipelineDeps, { sessionId }: PipelineInput): Promise<AiItemsState> => {
  const session = await requireSession(store, sessionId);
  const results = await store.listResults(sessionId);
  const items: ReportAiItem[] = [];
  const updated: ActivityResult[] = [];

  for (const result of results) {
    if (!isCompleted(result) || !aiScoredActivities.has(result.raw.activityId)) {
      updated.push(result);
      continue;
    }
    const scored = await ai.scoreItem({
      activityId: result.raw.activityId,
      data: result.raw.data,
      inputRef: `result:${result.id}`,
    });
    if (!scored) {
      updated.push(result);
      continue;
    }
    const scores = scored.output.scores.map((item) => ({
      metricId: item.metricId,
      ...sideOf(item.side),
      value: item.value,
      scoredBy: 'ai' as const,
    }));
    updated.push(withScores(result, 'ai', scores));
    items.push({ resultId: result.id, ai: scored.meta });
  }

  if (items.length > 0) {
    await store.putResults(sessionId, updated);
    await store.putMetricValues(metricPoints(session, updated, 'ai'));
  }
  return { sessionId, aiItems: items };
};
