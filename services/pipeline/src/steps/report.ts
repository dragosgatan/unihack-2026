import { metricDefinitions, type ReportScore, type ReportSkip } from '@tempo/shared';
import { requireSession, sideOf, type PipelineDeps } from '../ports.ts';
import type { CompareState, PipelineInput } from '../state.ts';
import { isSkipped } from './results.ts';

export const report = async ({ store, ai, clock }: PipelineDeps, state: CompareState): Promise<PipelineInput> => {
  const { sessionId } = state;
  if (await store.getReport(sessionId)) return { sessionId };

  const session = await requireSession(store, sessionId);
  const [detail, results, flags] = await Promise.all([
    store.getPatientDetail(session.patientId),
    store.listResults(sessionId),
    store.listFlags(session.patientId, sessionId),
  ]);

  const skipped = results.filter(isSkipped).map(
    (result): ReportSkip => ({
      resultId: result.id,
      activityId: result.activityId,
      reason: result.reason,
      stage: result.stage,
      skippedAt: result.skippedAt,
      ...(result.painLocation === undefined ? {} : { painLocation: result.painLocation }),
      ...(result.note === undefined ? {} : { note: result.note }),
    }),
  );

  const scores = state.comparisons.map(
    (comparison): ReportScore => ({
      resultId: comparison.resultId,
      activityId: comparison.activityId,
      metricId: comparison.metricId,
      ...sideOf(comparison.side),
      value: comparison.value,
      unit: metricDefinitions[comparison.metricId].unit,
      scoredBy: comparison.scoredBy,
      baseline: comparison.baseline,
      referenceBand: comparison.referenceBand,
      flagged: flags.some((flag) => flag.metricId === comparison.metricId && flag.side === comparison.side),
    }),
  );

  const { output, meta } = await ai.summarizeSession({
    sessionId,
    language: detail?.plan?.language ?? 'en',
    scores: scores.map(({ metricId, side, value, unit, baseline, flagged }) => ({
      metricId,
      ...sideOf(side),
      value,
      unit,
      baseline,
      flagged,
    })),
    skipped: skipped.map(({ activityId, reason, stage }) => ({ activityId, reason, stage })),
  });

  await store.putReport({
    sessionId,
    patientId: session.patientId,
    generatedAt: clock().toISOString(),
    skipped,
    scores,
    aiItems: state.aiItems,
    aiSummary: { label: 'ai-generated', summary: output.summary, claims: output.claims, ai: meta },
  });
  return { sessionId };
};
