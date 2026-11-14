import { metricDefinitions, metricIds, type MetricId, type MetricSeries, type SkipEvent, type SkipReason } from '@tempo/shared';
import { formatNumber, withUnit } from './format.ts';
import { metricNames } from './metricNames.ts';

export type HighlightKind = 'outside-range' | 'skips' | 'change';

export interface Highlight {
  metricId: MetricId;
  kind: HighlightKind;
  sentence: string;
  series: MetricSeries;
}

interface Candidate extends Highlight {
  tier: number;
  latestT: number;
}

export const maxHighlights = 4;

const monthMs = 30 * 86_400_000;

const skipReasonPhrases: Record<SkipReason, string> = {
  pain: 'because of pain',
  tired: 'because of tiredness',
  'not-understood': 'because the task was not understood',
  'cannot-see-or-hear': 'because of trouble seeing or hearing',
  'physically-unable': 'because it was physically not possible',
  'device-problem': 'because of a device problem',
  other: 'for another reason',
};

function timesWord(count: number): string {
  if (count === 1) return 'once';
  if (count === 2) return 'twice';
  return `${count} times`;
}

function sessionsPhrase(count: number): string {
  return count === 1 ? 'in the latest session' : `in the last ${count} sessions`;
}

function outsideRange(series: MetricSeries, points: { t: number; value: number }[]): Candidate | null {
  const band = series.referenceBand;
  const latest = points[points.length - 1];
  if (!band || !latest || points.length < 2) return null;
  const sideOf = (value: number) => (value > band.high ? 'above' : value < band.low ? 'below' : null);
  const side = sideOf(latest.value);
  if (side === null) return null;
  let run = 0;
  for (let index = points.length - 1; index >= 0 && sideOf(points[index]?.value ?? Number.NaN) === side; index--) run++;
  const { higherIsBetter } = metricDefinitions[series.metricId];
  const worse = (side === 'above') !== higherIsBetter;
  return {
    metricId: series.metricId,
    kind: 'outside-range',
    sentence: `${metricNames[series.metricId]} was ${side} the patient's usual range ${sessionsPhrase(run)}.`,
    series,
    tier: worse ? 0 : 3,
    latestT: latest.t,
  };
}

function skips(series: MetricSeries, monthStart: number, now: number): Candidate | null {
  const recent = series.events
    .filter((event): event is SkipEvent => event.type === 'skip')
    .filter((event) => Date.parse(event.t) >= monthStart && Date.parse(event.t) <= now)
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const last = recent[recent.length - 1];
  if (!last) return null;
  return {
    metricId: series.metricId,
    kind: 'skips',
    sentence: `Skipped ${timesWord(recent.length)} this month, most recently ${skipReasonPhrases[last.reason]}.`,
    series,
    tier: last.reason === 'pain' ? 1 : 2,
    latestT: Date.parse(last.t),
  };
}

function change(series: MetricSeries, points: { t: number; value: number }[]): Candidate | null {
  const { baseline, referenceBand } = series;
  const latest = points[points.length - 1];
  if (baseline === null || !referenceBand || !latest || points.length < 2) return null;
  const average = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const threshold = (referenceBand.high - referenceBand.low) / 4;
  if (threshold <= 0 || Math.abs(average - baseline) < threshold) return null;
  if (formatNumber(average) === formatNumber(baseline)) return null;
  const direction = average > baseline ? 'up' : 'down';
  return {
    metricId: series.metricId,
    kind: 'change',
    sentence: `${metricNames[series.metricId]} averaged ${withUnit(average, series.unit)} this month, ${direction} from a baseline of ${withUnit(baseline, series.unit)}.`,
    series,
    tier: 4,
    latestT: latest.t,
  };
}

function compareCandidates(a: Candidate, b: Candidate): number {
  return a.tier - b.tier || b.latestT - a.latestT || metricIds.indexOf(a.metricId) - metricIds.indexOf(b.metricId);
}

export function highlightsFrom(seriesList: readonly MetricSeries[], now: number): Highlight[] {
  const monthStart = now - monthMs;
  const candidates = seriesList.flatMap((series) => {
    const points = series.points
      .map((point) => ({ t: Date.parse(point.t), value: point.value }))
      .filter((point) => point.t >= monthStart && point.t <= now)
      .sort((a, b) => a.t - b.t);
    return [outsideRange(series, points), skips(series, monthStart, now), change(series, points)].filter(
      (candidate): candidate is Candidate => candidate !== null,
    );
  });

  const usedMetrics = new Set<MetricId>();
  const skippedActivities = new Set<string>();
  const picked: Highlight[] = [];
  for (const candidate of candidates.sort(compareCandidates)) {
    if (picked.length === maxHighlights) break;
    const activityId = metricDefinitions[candidate.metricId].activityId;
    if (usedMetrics.has(candidate.metricId)) continue;
    if (candidate.kind === 'skips' && skippedActivities.has(activityId)) continue;
    usedMetrics.add(candidate.metricId);
    if (candidate.kind === 'skips') skippedActivities.add(activityId);
    picked.push({ metricId: candidate.metricId, kind: candidate.kind, sentence: candidate.sentence, series: candidate.series });
  }
  return picked;
}
