import { metricDefinitions, type MedicalRecord, type MetricId, type MetricPoint, type MetricSeries, type PatientMetric, type Side } from '@tempo/shared';

const weekMs = 7 * 86_400_000;

export const symmetryMetricId: MetricId = 'single-leg-squat.symmetry';

export const sideLabels: Record<Side, string> = { left: 'Left', right: 'Right' };
export const sideInitials: Record<Side, string> = { left: 'L', right: 'R' };

export function affectedSide(record: MedicalRecord): Side | null {
  return record.injury?.side ?? record.affectedLimbs[0]?.side ?? null;
}

export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

export interface PairedValues {
  t: string;
  first: number;
  second: number;
}

export function pairByTime(first: readonly MetricPoint[], second: readonly MetricPoint[]): PairedValues[] {
  const secondByTime = new Map(second.map((point) => [Date.parse(point.t), point.value]));
  return first
    .flatMap((point): PairedValues[] => {
      const match = secondByTime.get(Date.parse(point.t));
      return match === undefined ? [] : [{ t: point.t, first: point.value, second: match }];
    })
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export interface SessionValues {
  t: string;
  first: number | null;
  second: number | null;
}

export function unionByTime(first: readonly MetricPoint[], second: readonly MetricPoint[]): SessionValues[] {
  const byTime = new Map<number, SessionValues>();
  for (const point of first) byTime.set(Date.parse(point.t), { t: point.t, first: point.value, second: null });
  for (const point of second) {
    const existing = byTime.get(Date.parse(point.t));
    if (existing) existing.second = point.value;
    else byTime.set(Date.parse(point.t), { t: point.t, first: null, second: point.value });
  }
  return [...byTime.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export function symmetryIndex(affected: number, other: number): number | null {
  if (other === 0) return null;
  return Math.round((affected / other) * 1000) / 10;
}

export function latestPoint(points: readonly MetricPoint[]): MetricPoint | undefined {
  return points.reduce<MetricPoint | undefined>((latest, point) => (latest === undefined || Date.parse(point.t) > Date.parse(latest.t) ? point : latest), undefined);
}

export function deriveSymmetrySeries(affected: MetricSeries, other: MetricSeries): MetricSeries {
  const points = pairByTime(affected.points, other.points).flatMap((pair): MetricPoint[] => {
    const value = symmetryIndex(pair.first, pair.second);
    return value === null ? [] : [{ t: pair.t, value }];
  });
  return { metricId: affected.metricId, unit: '%', points, baseline: null, referenceBand: null, events: affected.events };
}

export function weeksBetween(fromIsoDate: string, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - Date.parse(fromIsoDate)) / weekMs));
}

export function lateralMetricIds(metrics: readonly PatientMetric[]): MetricId[] {
  return metrics.filter((metric) => metric.lateral).map((metric) => metric.metricId);
}

export type SymmetrySource = { kind: 'server' } | { kind: 'derived'; metricId: MetricId };

export function symmetrySource(metrics: readonly PatientMetric[]): SymmetrySource | null {
  if (metrics.some((metric) => metric.metricId === symmetryMetricId)) return { kind: 'server' };
  const metricId = lateralMetricIds(metrics).find((id) => metricDefinitions[id].higherIsBetter);
  return metricId === undefined ? null : { kind: 'derived', metricId };
}

export function symmetryApplies(record: MedicalRecord, metrics: readonly PatientMetric[]): boolean {
  return affectedSide(record) !== null && lateralMetricIds(metrics).length > 0;
}
