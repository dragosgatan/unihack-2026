import { metricDefinitions, type Flag, type MetricId, type ReferenceBand, type Side } from '@tempo/shared';
import { requireSession, sideOf, type PipelineDeps } from '../ports.ts';
import type { CompareState, Comparison } from '../state.ts';

export const isWorseThanRange = (metricId: MetricId, value: number, band: ReferenceBand): boolean =>
  metricDefinitions[metricId].higherIsBetter ? value < band.low : value > band.high;

export const isReliableChange = ({ metricId, value, previous, referenceBand }: Comparison): boolean =>
  referenceBand !== null &&
  previous !== null &&
  isWorseThanRange(metricId, value, referenceBand) &&
  isWorseThanRange(metricId, previous, referenceBand);

export const flagId = (sessionId: string, metricId: MetricId, side: Side | undefined): string =>
  `${sessionId}:${metricId}:${side ?? 'none'}`;

export const detectChange = async ({ store, clock }: PipelineDeps, state: CompareState): Promise<CompareState> => {
  const session = await requireSession(store, state.sessionId);
  const createdAt = clock().toISOString();
  const flags = state.comparisons.flatMap((comparison): Flag[] =>
    isReliableChange(comparison) && comparison.baseline !== null
      ? [
          {
            id: flagId(session.id, comparison.metricId, comparison.side),
            patientId: session.patientId,
            sessionId: session.id,
            metricId: comparison.metricId,
            ...sideOf(comparison.side),
            kind: 'reliable-change',
            value: comparison.value,
            baseline: comparison.baseline,
            createdAt,
          },
        ]
      : [],
  );
  await store.putFlags(flags);
  return state;
};
