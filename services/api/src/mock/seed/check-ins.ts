import {
  metricDefinitions,
  type ActivityId,
  type ActivityResult,
  type BodyRegion,
  type CheckInEntry,
  type MetricId,
  type PainSkipFlag,
  type PainType,
  type Session,
  type SkipStage,
} from '@tempo/shared';
import type { MetricValue } from '../../store/types.ts';
import { minutesAfter } from './history.ts';

export type SeedHistory = { sessions: Session[]; metricValues: MetricValue[] };

export type PainSkipSeed = {
  session: Session;
  activityId: ActivityId;
  stage: SkipStage;
  painLocation: BodyRegion;
  minimumPain: number;
};

export type PainSkipped = SeedHistory & { result: ActivityResult; flag: PainSkipFlag };

export const withPainSkip = (history: SeedHistory, skip: PainSkipSeed): PainSkipped => {
  const { session } = skip;
  if (session.startedAt === undefined || session.submittedAt === undefined) {
    throw new Error(`Seed session ${session.id} has no start or submit time`);
  }
  const inSession = (value: MetricValue): boolean => value.sessionId === session.id;
  return {
    sessions: history.sessions.map((candidate): Session =>
      candidate.id === session.id ? { ...candidate, status: 'completed-with-skips' } : candidate,
    ),
    metricValues: history.metricValues
      .filter((value) => !(inSession(value) && metricDefinitions[value.metricId].activityId === skip.activityId))
      .map((value) =>
        inSession(value) && value.metricId === 'pain.intensity'
          ? { ...value, value: Math.max(value.value, skip.minimumPain) }
          : value,
      ),
    result: {
      status: 'skipped',
      id: `${session.id}-r00`,
      sessionId: session.id,
      patientId: session.patientId,
      activityId: skip.activityId,
      reason: 'pain',
      stage: skip.stage,
      skippedAt: minutesAfter(new Date(session.startedAt), 15).toISOString(),
      painLocation: skip.painLocation,
    },
    flag: {
      id: `${session.id}:pain-skip:${skip.activityId}`,
      patientId: session.patientId,
      sessionId: session.id,
      kind: 'pain-skip',
      activityId: skip.activityId,
      stage: skip.stage,
      painLocation: skip.painLocation,
      createdAt: minutesAfter(new Date(session.submittedAt), 1).toISOString(),
    },
  };
};

const valuesOf = (metricValues: MetricValue[], metricId: MetricId): MetricValue[] =>
  metricValues.filter((value) => value.metricId === metricId).sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

const entryFor = (value: MetricValue, item: string, body: CheckInEntry['body']): CheckInEntry => ({
  id: `${value.sessionId}-${item}`,
  patientId: value.patientId,
  sessionId: value.sessionId,
  recordedAt: value.t,
  recordedBy: { kind: 'patient' },
  body,
});

export const painEntries = (
  metricValues: MetricValue[],
  location: BodyRegion,
  typeAt: (index: number) => PainType,
): CheckInEntry[] =>
  valuesOf(metricValues, 'pain.intensity').map((value, index) =>
    entryFor(value, 'pain', {
      item: 'pain',
      intensity: value.value,
      ...(value.value > 0 ? { location, type: typeAt(index) } : {}),
    }),
  );

export type SeedDrug = { medicationId: string; name: string };

export type MedicationSwitch = { before: SeedDrug; after: SeedDrug; at: Date; takenFrom: number };

export const medicationEntries = (metricValues: MetricValue[], { before, after, at, takenFrom }: MedicationSwitch): CheckInEntry[] => {
  const switchedAt = at.toISOString();
  return valuesOf(metricValues, 'medication.adherence').map((value, index, all) => {
    const status = value.value >= takenFrom ? ('taken' as const) : ('missed' as const);
    const firstAfter = value.t >= switchedAt && (all[index - 1]?.t ?? '') < switchedAt;
    const medications =
      value.t < switchedAt
        ? [{ ...before, status }]
        : [...(firstAfter ? [{ ...before, status: 'stopped' as const }] : []), { ...after, status }];
    return entryFor(value, 'medication', { item: 'medication', medications });
  });
};

export const fallEntries = (metricValues: MetricValue[], description: string): CheckInEntry[] =>
  valuesOf(metricValues, 'episodes.count').map((value) =>
    entryFor(value, 'episodes', {
      item: 'episodes',
      episodes: value.value > 0 ? [{ type: 'fall', count: value.value, description }] : [],
    }),
  );
