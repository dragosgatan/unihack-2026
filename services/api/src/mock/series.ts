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
import type { MetricValue } from './seed/history.ts';
import type { MockStore } from './store.ts';

const rangeDays: Record<MetricRange, number> = { W: 7, M: 30, '6M': 182, Y: 365 };

const ownRangeMargins: Record<MetricId, number> = {
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

const seriesValues = (store: MockStore, patientId: string, metricId: MetricId, side: Side | undefined): MetricValue[] =>
  store.metricValues
    .filter((value) => value.patientId === patientId && value.metricId === metricId && value.side === side)
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

const sideFor = (metricId: MetricId, record: MedicalRecord, requested?: Side): Side | undefined =>
  metricDefinitions[metricId].lateral ? (requested ?? defaultSide(record)) : undefined;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const roundTo = (value: number, places: number): number => Number(value.toFixed(places));

export const listPatientMetrics = (store: MockStore, record: MedicalRecord): PatientMetric[] =>
  metricIds
    .filter((metricId) =>
      store.metricValues.some((value) => value.patientId === record.patientId && value.metricId === metricId),
    )
    .map((metricId) => {
      const { unit, lateral } = metricDefinitions[metricId];
      const last = seriesValues(store, record.patientId, metricId, sideFor(metricId, record)).at(-1);
      return last ? { metricId, unit, lateral, lastValue: last.value, lastT: last.t } : { metricId, unit, lateral };
    });

export type SeriesRequest = {
  record: MedicalRecord;
  metricId: MetricId;
  range: MetricRange;
  side: Side | undefined;
  now: Date;
};

export const buildMetricSeries = (store: MockStore, request: SeriesRequest): MetricSeries => {
  const { record, metricId, now } = request;
  const to = now.getTime();
  const from = to - rangeDays[request.range] * 86_400_000;
  const inRange = (t: string): boolean => Date.parse(t) >= from && Date.parse(t) <= to;

  const values = seriesValues(store, record.patientId, metricId, sideFor(metricId, record, request.side));
  const firstThree = values.slice(0, 3).map((value) => value.value);
  const baseline = firstThree.length === 3 ? median(firstThree) : null;
  const margin = ownRangeMargins[metricId];

  return {
    metricId,
    unit: metricDefinitions[metricId].unit,
    points: values.filter((value) => inRange(value.t)).map(({ t, value }) => ({ t, value })),
    baseline,
    referenceBand:
      baseline === null
        ? null
        : { low: roundTo(Math.max(0, baseline - margin), 2), high: roundTo(baseline + margin, 2) },
    events: record.timeline.filter((event) => inRange(event.t)).sort((a, b) => Date.parse(a.t) - Date.parse(b.t)),
  };
};
