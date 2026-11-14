import {
  metricDefinitions,
  type ActivityId,
  type Flag,
  type MetricId,
  type MetricSeries,
  type PatientMetric,
  type Session,
  type SessionStatus,
  type Side,
  type SkipReason,
  type SkipStage,
} from '@tempo/shared';
import type { SeriesRequest } from './api.ts';
import { isCheckInMetric } from './checkIn.ts';

export const sessionStatusLabels: Record<SessionStatus, string> = {
  created: 'Not started',
  'in-progress': 'In progress',
  submitted: 'Submitted',
  processed: 'Processed',
  'completed-with-skips': 'Completed with skips',
};

export const sessionModeLabels: Record<Session['mode'], string> = {
  kiosk: 'At the clinic',
  home: 'At home',
};

export function sessionTime(session: Session): string {
  return session.startedAt ?? session.createdAt;
}

export function summaryRequests(metrics: readonly PatientMetric[]): SeriesRequest[] {
  return metrics.flatMap(({ metricId }): SeriesRequest[] =>
    metricDefinitions[metricId].lateral
      ? [
          { metricId, side: 'left' },
          { metricId, side: 'right' },
        ]
      : [{ metricId, side: undefined }],
  );
}

export interface FetchedSeries {
  side: Side | undefined;
  series: MetricSeries;
}

export interface SessionSkip {
  key: string;
  activityId: ActivityId;
  t: string;
  reason: SkipReason;
  stage: SkipStage | undefined;
  painLocation: string | undefined;
  skippedLastSession: boolean;
}

function skipFlags(flags: readonly Flag[], sessionId: string) {
  return flags.flatMap((flag) => (flag.sessionId === sessionId && flag.kind !== 'reliable-change' ? [flag] : []));
}

export function sessionsWithSkips(series: readonly MetricSeries[], flags: readonly Flag[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of series) {
    for (const event of entry.events) if (event.type === 'skip') ids.add(event.sessionId);
  }
  for (const flag of flags) if (flag.kind !== 'reliable-change') ids.add(flag.sessionId);
  return ids;
}

export function sessionSkips(series: readonly MetricSeries[], flags: readonly Flag[], sessionId: string): SessionSkip[] {
  const sessionFlags = skipFlags(flags, sessionId);
  const byActivity = new Map<ActivityId, SessionSkip>();

  for (const entry of series) {
    const activityId = metricDefinitions[entry.metricId].activityId;
    for (const event of entry.events) {
      if (event.type !== 'skip' || event.sessionId !== sessionId || byActivity.has(activityId)) continue;
      byActivity.set(activityId, {
        key: event.id,
        activityId,
        t: event.t,
        reason: event.reason,
        stage: event.stage,
        painLocation: undefined,
        skippedLastSession: false,
      });
    }
  }

  for (const flag of sessionFlags) {
    const known = byActivity.get(flag.activityId);
    if (flag.kind === 'pain-skip') {
      byActivity.set(
        flag.activityId,
        known
          ? { ...known, painLocation: flag.painLocation ?? known.painLocation }
          : { key: flag.id, activityId: flag.activityId, t: flag.createdAt, reason: 'pain', stage: flag.stage, painLocation: flag.painLocation, skippedLastSession: false },
      );
    } else {
      byActivity.set(
        flag.activityId,
        known
          ? { ...known, skippedLastSession: true }
          : { key: flag.id, activityId: flag.activityId, t: flag.createdAt, reason: flag.reason, stage: undefined, painLocation: undefined, skippedLastSession: true },
      );
    }
  }

  return [...byActivity.values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export type MetricValue = { kind: 'single'; value: number } | { kind: 'sides'; left: number | null; right: number | null };

export interface MetricResult {
  metricId: MetricId;
  unit: string;
  value: MetricValue;
}

export interface ActivityResult {
  activityId: ActivityId;
  metrics: MetricResult[];
}

function sessionValue(series: MetricSeries, sessionId: string): number | null {
  return series.points.filter((point) => point.sessionId === sessionId).at(-1)?.value ?? null;
}

export function sessionResults(fetched: readonly FetchedSeries[], sessionId: string, skipped: ReadonlySet<ActivityId>): ActivityResult[] {
  const metrics = new Map<MetricId, MetricResult>();

  for (const { side, series } of fetched) {
    const value = sessionValue(series, sessionId);
    if (value === null || skipped.has(metricDefinitions[series.metricId].activityId)) continue;
    const known = metrics.get(series.metricId);
    if (side === undefined) {
      metrics.set(series.metricId, { metricId: series.metricId, unit: series.unit, value: { kind: 'single', value } });
      continue;
    }
    const sides = known?.value.kind === 'sides' ? known.value : { kind: 'sides' as const, left: null, right: null };
    metrics.set(series.metricId, { metricId: series.metricId, unit: series.unit, value: { ...sides, [side]: value } });
  }

  const activities = new Map<ActivityId, ActivityResult>();
  for (const metric of metrics.values()) {
    const activityId = metricDefinitions[metric.metricId].activityId;
    const activity = activities.get(activityId) ?? { activityId, metrics: [] };
    activity.metrics.push(metric);
    activities.set(activityId, activity);
  }
  return [...activities.values()];
}

export function splitCheckIn(results: readonly ActivityResult[]): { activities: ActivityResult[]; checkIn: MetricResult[] } {
  return {
    activities: results.filter((result) => !result.metrics.some((metric) => isCheckInMetric(metric.metricId))),
    checkIn: results.flatMap((result) => result.metrics.filter((metric) => isCheckInMetric(metric.metricId))),
  };
}

export type SessionBadge = 'completed-with-skips' | 'partial' | 'in-progress' | 'not-started';

export const sessionBadgeLabels: Record<SessionBadge, string> = {
  'completed-with-skips': 'Completed with skips',
  partial: 'Partial',
  'in-progress': 'In progress',
  'not-started': 'Not started',
};

export function sessionBadges(session: Session, hasSkips: boolean): SessionBadge[] {
  const badges: SessionBadge[] = [];
  const finished = session.status !== 'created' && session.status !== 'in-progress';
  if (session.status === 'completed-with-skips' || (finished && hasSkips)) badges.push('completed-with-skips');
  if (session.partial) badges.push('partial');
  if (session.status === 'in-progress') badges.push('in-progress');
  if (session.status === 'created') badges.push('not-started');
  return badges;
}
