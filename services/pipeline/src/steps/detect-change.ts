import {
  metricDefinitions,
  type ActivityId,
  type Flag,
  type MetricId,
  type PainSkipFlag,
  type ReferenceBand,
  type RepeatedSkipFlag,
  type Session,
  type SessionStatus,
  type Side,
  type SkipFlag,
} from '@tempo/shared';
import { requireSession, sideOf, type PipelineDeps, type PipelineStore } from '../ports.ts';
import type { CompareState, Comparison } from '../state.ts';
import { isPainSkip } from './pain-alert.ts';
import { isSkipped, type SkippedActivityResult } from './results.ts';

export const isWorseThanRange = (metricId: MetricId, value: number, band: ReferenceBand): boolean =>
  metricDefinitions[metricId].higherIsBetter ? value < band.low : value > band.high;

export const isReliableChange = ({ metricId, value, previous, referenceBand }: Comparison): boolean =>
  referenceBand !== null &&
  previous !== null &&
  isWorseThanRange(metricId, value, referenceBand) &&
  isWorseThanRange(metricId, previous, referenceBand);

export const flagId = (sessionId: string, metricId: MetricId, side: Side | undefined): string =>
  `${sessionId}:${metricId}:${side ?? 'none'}`;

export const skipFlagId = (sessionId: string, kind: SkipFlag['kind'], activityId: ActivityId): string =>
  `${sessionId}:${kind}:${activityId}`;

const finishedStatuses: ReadonlySet<SessionStatus> = new Set(['submitted', 'processed', 'completed-with-skips']);

const sessionTime = (session: Session): string => session.submittedAt ?? session.createdAt;

export const previousSession = (sessions: Session[], current: Session): Session | undefined =>
  sessions
    .filter(
      (session) =>
        session.id !== current.id &&
        finishedStatuses.has(session.status) &&
        sessionTime(session) < sessionTime(current),
    )
    .reduce<Session | undefined>(
      (latest, session) => (latest === undefined || sessionTime(session) > sessionTime(latest) ? session : latest),
      undefined,
    );

export const painSkipFlags = (session: Session, skipped: SkippedActivityResult[], createdAt: string): PainSkipFlag[] =>
  skipped.filter(isPainSkip).map((skip) => ({
    id: skipFlagId(session.id, 'pain-skip', skip.activityId),
    patientId: session.patientId,
    sessionId: session.id,
    kind: 'pain-skip',
    activityId: skip.activityId,
    stage: skip.stage,
    ...(skip.painLocation === undefined ? {} : { painLocation: skip.painLocation }),
    createdAt,
  }));

export const repeatedSkipFlags = (
  session: Session,
  skipped: SkippedActivityResult[],
  previous: { sessionId: string; skipped: SkippedActivityResult[] } | undefined,
  createdAt: string,
): RepeatedSkipFlag[] =>
  previous === undefined
    ? []
    : skipped
        .filter((skip) => previous.skipped.some((earlier) => earlier.activityId === skip.activityId))
        .map((skip) => ({
          id: skipFlagId(session.id, 'repeated-skip', skip.activityId),
          patientId: session.patientId,
          sessionId: session.id,
          kind: 'repeated-skip',
          activityId: skip.activityId,
          previousSessionId: previous.sessionId,
          reason: skip.reason,
          createdAt,
        }));

const skipFlags = async (store: PipelineStore, session: Session, createdAt: string): Promise<SkipFlag[]> => {
  const skipped = (await store.listResults(session.id)).filter(isSkipped);
  if (skipped.length === 0) return [];
  const before = previousSession(await store.listPatientSessions(session.patientId), session);
  const previous = before && {
    sessionId: before.id,
    skipped: (await store.listResults(before.id)).filter(isSkipped),
  };
  return [...painSkipFlags(session, skipped, createdAt), ...repeatedSkipFlags(session, skipped, previous, createdAt)];
};

export const detectChange = async ({ store, clock }: PipelineDeps, state: CompareState): Promise<CompareState> => {
  const session = await requireSession(store, state.sessionId);
  const createdAt = clock().toISOString();
  const changes = state.comparisons.flatMap((comparison): Flag[] =>
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
  await store.putFlags([...changes, ...(await skipFlags(store, session, createdAt))]);
  return state;
};
