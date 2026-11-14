import type { MetricSeries, SkipEvent, SkipReason, SkipStage } from '@tempo/shared';
import { unionByTime } from './symmetry.ts';

export const skipReasonLabels: Record<SkipReason, string> = {
  pain: 'It hurts',
  tired: 'Too tired',
  'not-understood': "Didn't understand",
  'cannot-see-or-hear': "Couldn't see or hear",
  'physically-unable': 'Physically unable',
  'device-problem': 'Device problem',
  other: 'Something else',
};

export const skipStageLabels: Record<SkipStage, string> = {
  instructions: 'Stopped at instructions',
  practice: 'Stopped at practice',
  task: 'Stopped at task',
};

export type SessionRow =
  | { kind: 'result'; key: string; t: string; value: number; sessionId: string | undefined }
  | { kind: 'skipped'; key: string; t: string; event: SkipEvent };

export function sessionRows(series: MetricSeries): SessionRow[] {
  const results = series.points.map((point, index): SessionRow => ({ kind: 'result', key: `point-${index}-${point.t}`, t: point.t, value: point.value, sessionId: point.sessionId }));
  const skips = series.events.flatMap((event): SessionRow[] => (event.type === 'skip' ? [{ kind: 'skipped', key: event.id, t: event.t, event }] : []));
  return [...results, ...skips].sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
}

export type PairedSessionRow =
  | { kind: 'result'; key: string; t: string; first: number | null; second: number | null }
  | { kind: 'skipped'; key: string; t: string; event: SkipEvent };

export function pairedSessionRows(first: MetricSeries, second: MetricSeries): PairedSessionRow[] {
  const results = unionByTime(first.points, second.points).map((row): PairedSessionRow => ({ kind: 'result', key: `pair-${row.t}`, ...row }));
  const skips = first.events.flatMap((event): PairedSessionRow[] => (event.type === 'skip' ? [{ kind: 'skipped', key: event.id, t: event.t, event }] : []));
  return [...results, ...skips].sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
}
