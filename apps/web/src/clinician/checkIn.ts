import {
  bodyRegionSchema,
  bodyRegions,
  type BodyRegion,
  type Flag,
  type Medication,
  type MetricId,
  type MetricRange,
  type MetricSeries,
  type PatientMetric,
  type TimelineEvent,
} from '@tempo/shared';
import { inDomain, latestTime, timeDomain, type TimeDomain } from '../ui/index.ts';
import { metricDomains } from './domains.ts';

export const checkInMetricIds = ['pain.intensity', 'medication.adherence', 'episodes.count'] as const satisfies readonly MetricId[];

export type CheckInMetricId = (typeof checkInMetricIds)[number];

export function isCheckInMetric(metricId: MetricId): boolean {
  return metricDomains[metricId] === 'check-in';
}

export function sharedDomain(range: MetricRange, series: readonly MetricSeries[], now: number): TimeDomain {
  const times = series.flatMap((entry) => [...entry.points, ...entry.events].map((item) => Date.parse(item.t)));
  return timeDomain(range, latestTime(times, now));
}

export interface CalendarCell {
  start: number;
  end: number;
  count: number;
  falls: TimelineEvent[];
}

export function calendarSpans(range: MetricRange, domain: TimeDomain): { start: number; end: number }[] {
  const stepDays = range === 'W' || range === 'M' ? 1 : 7;
  const spans: { start: number; end: number }[] = [];
  const cursor = new Date(domain.start);
  while (cursor.getTime() < domain.end) {
    const start = cursor.getTime();
    cursor.setDate(cursor.getDate() + stepDays);
    spans.push({ start, end: Math.min(cursor.getTime(), domain.end) });
  }
  return spans;
}

export function episodeCalendar(
  range: MetricRange,
  domain: TimeDomain,
  episodes: readonly { t: string; value: number }[],
  timeline: readonly TimelineEvent[],
): CalendarCell[] {
  const falls = timeline.filter((event) => event.type === 'fall');
  const within = (t: string, span: { start: number; end: number }) => {
    const time = Date.parse(t);
    return time >= span.start && time < span.end;
  };
  return calendarSpans(range, domain).map((span) => ({
    ...span,
    count: episodes.filter((point) => within(point.t, span)).reduce((sum, point) => sum + point.value, 0),
    falls: falls.filter((event) => within(event.t, span)),
  }));
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const rangeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function cellLabel(cell: CalendarCell, range: MetricRange): string {
  return range === 'W' || range === 'M' ? dayFormat.format(cell.start) : `Week of ${rangeFormat.formatRange(cell.start, cell.end - 1)}`;
}

export function episodeCountText(count: number): string {
  return count === 1 ? '1 episode reported' : `${count} episodes reported`;
}

export function cellsWithEpisodes(cells: readonly CalendarCell[]): CalendarCell[] {
  return cells.filter((cell) => cell.count > 0 || cell.falls.length > 0).reverse();
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export function heatLevel(count: number): HeatLevel {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export const heatFillClasses: Record<HeatLevel, string> = {
  0: 'fill-fill',
  1: 'fill-heat-1',
  2: 'fill-heat-2',
  3: 'fill-heat-3',
  4: 'fill-heat-4',
};

export const heatLevelLabels: Record<Exclude<HeatLevel, 0>, string> = {
  1: '1',
  2: '2',
  3: '3–4',
  4: '5+',
};

export interface RegionCount {
  region: BodyRegion;
  count: number;
}

export function painRegionCounts(flags: readonly Flag[], domain: TimeDomain): RegionCount[] {
  const counts = new Map<BodyRegion, number>();
  for (const flag of flags) {
    if (flag.kind !== 'pain-skip' || !inDomain(Date.parse(flag.createdAt), domain)) continue;
    const region = bodyRegionSchema.safeParse(flag.painLocation);
    if (region.success) counts.set(region.data, (counts.get(region.data) ?? 0) + 1);
  }
  return bodyRegions
    .flatMap((region): RegionCount[] => {
      const count = counts.get(region);
      return count === undefined ? [] : [{ region, count }];
    })
    .sort((a, b) => b.count - a.count);
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function currentMedications(medications: readonly Medication[], today: Date): Medication[] {
  const todayIso = isoDay(today);
  return medications.filter((medication) => medication.stopDate === undefined || medication.stopDate > todayIso);
}

export function medicationChanges(timeline: readonly TimelineEvent[], domain: TimeDomain): TimelineEvent[] {
  return timeline
    .filter((event) => event.type === 'medication-change' && inDomain(Date.parse(event.t), domain))
    .sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
}

export function compareCandidates(metrics: readonly PatientMetric[]): PatientMetric[] {
  return metrics.filter((metric) => !isCheckInMetric(metric.metricId));
}

const preferredCompareMetric: MetricId = 'sit-to-stand.count';

export function defaultCompareMetric(metrics: readonly PatientMetric[]): MetricId | null {
  const candidates = compareCandidates(metrics);
  const withData = candidates.filter((metric) => metric.lastValue !== undefined);
  const preferred = withData.find((metric) => metric.metricId === preferredCompareMetric);
  return (preferred ?? withData[0] ?? candidates[0])?.metricId ?? null;
}

export function lastCheckIn(metrics: readonly PatientMetric[]): string | undefined {
  const times = metrics.filter((metric) => isCheckInMetric(metric.metricId) && metric.lastT !== undefined).map((metric) => metric.lastT ?? '');
  return times.sort().at(-1);
}
