import { metricDefinitions, type ReportScore, type ReportSkip, type SessionReport, type SkipFlag } from '@tempo/shared';
import { requireSession, sideOf, type PipelineDeps, type PipelineStore } from '../ports.ts';
import { historyMonths, monthsBefore, renderSessionReportPdf, type ReportPdfHistory } from '../report-pdf/index.ts';
import { reportPdfKey } from '../report-files.ts';
import type { CompareState, Comparison, PipelineInput } from '../state.ts';
import { isSkipped } from './results.ts';

const historyOf = async (store: PipelineStore, patientId: string, comparison: Comparison): Promise<ReportPdfHistory> => ({
  metricId: comparison.metricId,
  ...sideOf(comparison.side),
  previous: comparison.previous,
  points: await store.listPoints(patientId, comparison.metricId, comparison.side, {
    from: monthsBefore(comparison.t, historyMonths),
    to: comparison.t,
  }),
});

export const report = async (
  { store, ai, clock, reportFiles }: PipelineDeps,
  state: CompareState,
): Promise<PipelineInput> => {
  const { sessionId } = state;
  if (await store.getReport(sessionId)) return { sessionId };

  const session = await requireSession(store, sessionId);
  const [detail, results, flags, history] = await Promise.all([
    store.getPatientDetail(session.patientId),
    store.listResults(sessionId),
    store.listFlags(session.patientId, sessionId),
    Promise.all(state.comparisons.map((comparison) => historyOf(store, session.patientId, comparison))),
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
      flagged: flags.some(
        (flag) =>
          flag.kind === 'reliable-change' && flag.metricId === comparison.metricId && flag.side === comparison.side,
      ),
    }),
  );
  const attention = flags.filter((flag): flag is SkipFlag => flag.kind !== 'reliable-change');

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

  const built: SessionReport = {
    sessionId,
    patientId: session.patientId,
    generatedAt: clock().toISOString(),
    skipped,
    attention,
    scores,
    aiItems: state.aiItems,
    aiSummary: { label: 'ai-generated', summary: output.summary, claims: output.claims, ai: meta },
  };
  if (!detail) {
    console.warn(`No patient found for session ${sessionId}, so the report has no PDF`);
    await store.putReport(built);
    return { sessionId };
  }
  const pdfKey = reportPdfKey(session.patientId, sessionId);
  await reportFiles.put(pdfKey, await renderSessionReportPdf({ report: built, patient: detail.patient, session, history }));
  await store.putReport({ ...built, pdfKey });
  return { sessionId };
};
