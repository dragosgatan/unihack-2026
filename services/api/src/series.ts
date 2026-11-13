import {
  initialBaseline,
  initialBaselineSessions,
  metricDefinitions,
  metricIds,
  ownRange,
  type MedicalRecord,
  type MetricId,
  type MetricRange,
  type MetricSeries,
  type PatientMetric,
  type Side,
} from '@tempo/shared';
import type { Store } from './store/types.ts';

const rangeDays: Record<MetricRange, number> = { W: 7, M: 30, '6M': 182, Y: 365 };

export const defaultSide = (record: MedicalRecord): Side =>
  record.injury?.side ?? record.affectedLimbs[0]?.side ?? record.dominantHand;

const sideFor = (metricId: MetricId, record: MedicalRecord, requested?: Side): Side | undefined =>
  metricDefinitions[metricId].lateral ? (requested ?? defaultSide(record)) : undefined;

export const listPatientMetrics = async (store: Store, record: MedicalRecord): Promise<PatientMetric[]> => {
  const latest = await store.listLatest(record.patientId);
  return metricIds
    .filter((metricId) => latest.some((value) => value.metricId === metricId))
    .map((metricId) => {
      const { unit, lateral } = metricDefinitions[metricId];
      const side = sideFor(metricId, record);
      const last = latest.find((value) => value.metricId === metricId && value.side === side);
      return last ? { metricId, unit, lateral, lastValue: last.value, lastT: last.t } : { metricId, unit, lateral };
    });
};

export type SeriesRequest = {
  record: MedicalRecord;
  metricId: MetricId;
  range: MetricRange;
  side: Side | undefined;
  now: Date;
};

const baselineOf = async (store: Store, patientId: string, metricId: MetricId, side: Side | undefined) => {
  const set = await store.latestBaseline(patientId, metricId, side);
  if (set) return set.value;
  return initialBaseline(await store.firstPoints(patientId, metricId, side, initialBaselineSessions));
};

export const buildMetricSeries = async (store: Store, request: SeriesRequest): Promise<MetricSeries> => {
  const { record, metricId, now } = request;
  const patientId = record.patientId;
  const to = now.toISOString();
  const from = new Date(now.getTime() - rangeDays[request.range] * 86_400_000).toISOString();
  const range = { from, to };
  const side = sideFor(metricId, record, request.side);
  const definition = metricDefinitions[metricId];

  const [points, baseline, skips] = await Promise.all([
    store.listPoints(patientId, metricId, side, range),
    baselineOf(store, patientId, metricId, side),
    store.listSkipEvents(patientId, definition.activityId, range),
  ]);
  const timeline = record.timeline.filter(
    (event) => Date.parse(event.t) >= Date.parse(from) && Date.parse(event.t) <= now.getTime(),
  );

  return {
    metricId,
    unit: definition.unit,
    points,
    baseline,
    referenceBand: baseline === null ? null : ownRange(metricId, baseline),
    events: [...timeline, ...skips].sort((a, b) => Date.parse(a.t) - Date.parse(b.t)),
  };
};
