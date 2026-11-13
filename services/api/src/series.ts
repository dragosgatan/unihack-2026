import {
  metricDefinitions,
  metricIds,
  type MedicalRecord,
  type MetricId,
  type MetricRange,
  type MetricSeries,
  type PatientMetric,
  type Side,
} from '@tempo/shared';
import type { Store } from './store/types.ts';

const rangeDays: Record<MetricRange, number> = { W: 7, M: 30, '6M': 182, Y: 365 };

export const ownRangeMargins: Record<MetricId, number> = {
  'finger-tapping.taps-per-second': 0.4,
  'finger-tapping.variability': 4,
  'finger-tapping.decrement': 5,
  'trail-making-a.time': 8,
  'trail-making-a.errors': 1,
  'trail-making-b.time': 15,
  'trail-making-b.errors': 1,
  'clock-drawing.score': 1,
  'word-recall.immediate': 1,
  'word-recall.delayed': 1,
  'spiral-tracing.deviation': 0.8,
  'spiral-tracing.tremor-frequency': 0.6,
  'spiral-tracing.speed': 3,
  'shoulder-raise.peak-angle': 10,
  'shoulder-raise.repetitions': 2,
  'shoulder-raise.smoothness': 0.08,
  'sit-to-stand.count': 2,
  'sit-to-stand.time-per-repetition': 0.5,
  'single-leg-squat.depth': 8,
  'single-leg-squat.knee-angle': 8,
  'single-leg-squat.knee-valgus': 3,
  'single-leg-squat.symmetry': 6,
  'pain.intensity': 2,
  'medication.adherence': 10,
  'episodes.count': 1,
};

export const defaultSide = (record: MedicalRecord): Side =>
  record.injury?.side ?? record.affectedLimbs[0]?.side ?? record.dominantHand;

const sideFor = (metricId: MetricId, record: MedicalRecord, requested?: Side): Side | undefined =>
  metricDefinitions[metricId].lateral ? (requested ?? defaultSide(record)) : undefined;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const roundTo = (value: number, places: number): number => Number(value.toFixed(places));

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
  const firstThree = await store.firstPoints(patientId, metricId, side, 3);
  return firstThree.length === 3 ? median(firstThree.map((point) => point.value)) : null;
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
  const margin = ownRangeMargins[metricId];
  const timeline = record.timeline.filter(
    (event) => Date.parse(event.t) >= Date.parse(from) && Date.parse(event.t) <= now.getTime(),
  );

  return {
    metricId,
    unit: definition.unit,
    points,
    baseline,
    referenceBand:
      baseline === null
        ? null
        : { low: roundTo(Math.max(0, baseline - margin), 2), high: roundTo(baseline + margin, 2) },
    events: [...timeline, ...skips].sort((a, b) => Date.parse(a.t) - Date.parse(b.t)),
  };
};
