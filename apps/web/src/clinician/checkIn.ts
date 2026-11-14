import {
  bodyRegionSchema,
  bodyRegions,
  painTypeSchema,
  type BodyRegion,
  type CheckInEntry,
  type Episode,
  type EpisodeType,
  type Flag,
  type MedicationStatus,
  type Medication,
  type MetricId,
  type MetricRange,
  type MetricSeries,
  type PainType,
  type PatientMetric,
  type TimelineEvent,
} from '@tempo/shared';
import { inDomain, latestTime, timeDomain, type TimeDomain } from '../ui/index.ts';
import { episodeSourceLabels, episodeTypeLabel } from './checkInLabels.ts';
import { metricDomains } from './domains.ts';

export const checkInMetricIds = ['pain.intensity', 'medication.adherence'] as const satisfies readonly MetricId[];

export type CheckInMetricId = (typeof checkInMetricIds)[number];

export function isCheckInMetric(metricId: MetricId): boolean {
  return metricDomains[metricId] === 'check-in';
}

export function sharedDomain(range: MetricRange, series: readonly MetricSeries[], now: number, extraTimes: readonly string[] = []): TimeDomain {
  const times = [...series.flatMap((entry) => [...entry.points, ...entry.events].map((item) => item.t)), ...extraTimes].map((t) => Date.parse(t));
  return timeDomain(range, latestTime(times, now));
}

function entriesInDomain(entries: readonly CheckInEntry[], domain: TimeDomain): CheckInEntry[] {
  return entries.filter((entry) => inDomain(Date.parse(entry.recordedAt), domain));
}

export interface EpisodeTally {
  type: EpisodeType;
  source: Episode['source'];
  count: number;
}

export interface CalendarCell {
  start: number;
  end: number;
  count: number;
  tallies: EpisodeTally[];
  descriptions: string[];
  falls: TimelineEvent[];
  hasFall: boolean;
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

function tallyEpisodes(episodes: readonly Episode[]): EpisodeTally[] {
  const tallies: EpisodeTally[] = [];
  for (const episode of episodes) {
    const existing = tallies.find((tally) => tally.type === episode.type && tally.source === episode.source);
    if (existing) existing.count += episode.count;
    else tallies.push({ type: episode.type, source: episode.source, count: episode.count });
  }
  return tallies.sort((a, b) => b.count - a.count);
}

export function episodeCalendar(
  range: MetricRange,
  domain: TimeDomain,
  episodes: readonly Episode[],
  timeline: readonly TimelineEvent[],
): CalendarCell[] {
  const recordFalls = timeline.filter((event) => event.type === 'fall');
  const within = (t: string, span: { start: number; end: number }) => {
    const time = Date.parse(t);
    return time >= span.start && time < span.end;
  };
  return calendarSpans(range, domain).map((span) => {
    const inCell = episodes.filter((episode) => within(episode.occurredAt, span)).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    const falls = recordFalls.filter((event) => within(event.t, span));
    return {
      ...span,
      count: inCell.reduce((sum, episode) => sum + episode.count, 0),
      tallies: tallyEpisodes(inCell),
      descriptions: inCell.flatMap((episode) => (episode.description === undefined ? [] : [episode.description])),
      falls,
      hasFall: falls.length > 0 || inCell.some((episode) => episode.type === 'fall'),
    };
  });
}

export function tallyText(tallies: readonly EpisodeTally[]): string {
  return tallies.map((tally) => `${tally.count} ${episodeTypeLabel(tally.type, tally.count)} (${episodeSourceLabels[tally.source]})`).join(' · ');
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const rangeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function cellLabel(cell: CalendarCell, range: MetricRange): string {
  return range === 'W' || range === 'M' ? dayFormat.format(cell.start) : `Week of ${rangeFormat.formatRange(cell.start, cell.end - 1)}`;
}

export function episodeCountText(count: number): string {
  return count === 1 ? '1 episode' : `${count} episodes`;
}

export function quoted(text: string): string {
  return `“${text}”`;
}

export function cellDetail(cell: CalendarCell): string {
  const parts = [
    ...(cell.tallies.length > 0 ? [tallyText(cell.tallies)] : []),
    ...cell.falls.map((fall) => `Fall in record: ${fall.label}`),
    ...cell.descriptions.map(quoted),
  ];
  return parts.length === 0 ? 'No episodes' : parts.join(' · ');
}

export function cellsWithEpisodes(cells: readonly CalendarCell[]): CalendarCell[] {
  return cells.filter((cell) => cell.count > 0 || cell.hasFall).reverse();
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
  checkIns: number;
  stopped: number;
}

export function regionTotal(entry: RegionCount): number {
  return entry.checkIns + entry.stopped;
}

export function painRegionCounts(entries: readonly CheckInEntry[], flags: readonly Flag[], domain: TimeDomain): RegionCount[] {
  const counts = new Map<BodyRegion, RegionCount>();
  const add = (location: string | undefined, key: 'checkIns' | 'stopped') => {
    const region = bodyRegionSchema.safeParse(location);
    if (!region.success) return;
    const current = counts.get(region.data) ?? { region: region.data, checkIns: 0, stopped: 0 };
    current[key] += 1;
    counts.set(region.data, current);
  };
  for (const entry of entriesInDomain(entries, domain)) {
    if (entry.body.item === 'pain') add(entry.body.location, 'checkIns');
  }
  for (const flag of flags) {
    if (flag.kind === 'pain-skip' && inDomain(Date.parse(flag.createdAt), domain)) add(flag.painLocation, 'stopped');
  }
  return bodyRegions
    .flatMap((region): RegionCount[] => {
      const count = counts.get(region);
      return count === undefined ? [] : [count];
    })
    .sort((a, b) => regionTotal(b) - regionTotal(a));
}

export function regionCountText(entry: RegionCount): string {
  const parts = [
    entry.checkIns > 0 ? (entry.checkIns === 1 ? '1 check-in' : `${entry.checkIns} check-ins`) : '',
    entry.stopped > 0 ? (entry.stopped === 1 ? '1 stopped activity' : `${entry.stopped} stopped activities`) : '',
  ];
  return parts.filter((part) => part !== '').join(', ');
}

export function painTypeTally(entries: readonly CheckInEntry[], domain: TimeDomain): { type: PainType; count: number }[] {
  const inRange = entriesInDomain(entries, domain);
  return painTypeSchema.options.flatMap((type) => {
    const count = inRange.filter((entry) => entry.body.item === 'pain' && entry.body.type === type).length;
    return count === 0 ? [] : [{ type, count }];
  });
}

export interface MedicationMark {
  entryId: string;
  t: string;
  status: MedicationStatus;
  sideEffects?: string;
}

export interface MedicationRow {
  medicationId: string;
  label: string;
  detail?: string;
  marks: MedicationMark[];
}

export function medicationRows(entries: readonly CheckInEntry[], medications: readonly Medication[], domain: TimeDomain): MedicationRow[] {
  const rows = new Map<string, MedicationRow>();
  const inRange = entriesInDomain(entries, domain).sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  for (const entry of inRange) {
    if (entry.body.item !== 'medication') continue;
    for (const drug of entry.body.medications) {
      let row = rows.get(drug.medicationId);
      if (!row) {
        const recorded = medications.find((medication) => medication.id === drug.medicationId);
        row = recorded
          ? { medicationId: drug.medicationId, label: recorded.name, detail: `${recorded.dose} · ${recorded.frequency}`, marks: [] }
          : { medicationId: drug.medicationId, label: drug.name, marks: [] };
        rows.set(drug.medicationId, row);
      }
      row.marks.push({
        entryId: entry.id,
        t: entry.recordedAt,
        status: drug.status,
        ...(drug.sideEffects === undefined ? {} : { sideEffects: drug.sideEffects }),
      });
    }
  }
  return [...rows.values()];
}

export function rowName(row: MedicationRow): string {
  return row.detail === undefined ? row.label : `${row.label} ${row.detail}`;
}

export function isSingleDrugAdherence(entries: readonly CheckInEntry[], domain: TimeDomain): boolean {
  const countable = entriesInDomain(entries, domain).flatMap((entry) =>
    entry.body.item === 'medication' ? [entry.body.medications.filter((drug) => drug.status !== 'stopped').length] : [],
  );
  const scored = countable.filter((count) => count > 0);
  return scored.length > 0 && scored.every((count) => count === 1);
}

export interface SideEffectReport {
  key: string;
  t: string;
  drug: string;
  text: string;
}

export function sideEffectReports(rows: readonly MedicationRow[]): SideEffectReport[] {
  return rows
    .flatMap((row) =>
      row.marks.flatMap((mark) =>
        mark.sideEffects === undefined ? [] : [{ key: `${mark.entryId}-${row.medicationId}`, t: mark.t, drug: rowName(row), text: mark.sideEffects }],
      ),
    )
    .sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
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
