import type { MetricRange } from '@tempo/shared';

export const chartLocale = 'en-GB';

const dayMs = 86_400_000;

export interface TimeDomain {
  start: number;
  end: number;
}

export interface TimeTick {
  t: number;
  label: string;
}

export function latestTime(times: readonly number[], now: number): number {
  return times.length === 0 ? now : Math.max(...times);
}

export function timeDomain(range: MetricRange, latest: number): TimeDomain {
  const end = new Date(latest);
  end.setHours(24, 0, 0, 0);
  const start = new Date(end);
  if (range === 'W') start.setDate(start.getDate() - 7);
  else if (range === 'M') start.setMonth(start.getMonth() - 1);
  else if (range === '6M') start.setMonth(start.getMonth() - 6);
  else start.setFullYear(start.getFullYear() - 1);
  return { start: start.getTime(), end: end.getTime() };
}

export function inDomain(t: number, domain: TimeDomain): boolean {
  return t >= domain.start && t <= domain.end;
}

export function linearScale(domain: readonly [number, number], range: readonly [number, number]): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

function decimalsOf(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step)));
}

export function niceTicks(min: number, max: number, count = 4): number[] {
  let lo = min;
  let hi = max;
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad;
    hi += pad;
  }
  const rough = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = (normalised < 1.5 ? 1 : normalised < 3 ? 2 : normalised < 7 ? 5 : 10) * magnitude;
  const decimals = decimalsOf(step);
  const first = Math.floor(lo / step) * step;
  const last = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= last + step / 2; value += step) {
    ticks.push(Number(value.toFixed(decimals)));
  }
  return ticks;
}

export function nearestIndex(sorted: readonly number[], target: number): number {
  if (sorted.length === 0) return -1;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sorted[mid] ?? 0) < target) lo = mid + 1;
    else hi = mid;
  }
  const after = sorted[lo] ?? 0;
  const before = sorted[lo - 1];
  if (before !== undefined && target - before <= after - target) return lo - 1;
  return lo;
}

export function splitAtGaps<T extends { t: number }>(items: readonly T[], gapTimes: readonly number[]): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];
  let previous: T | undefined;
  for (const item of items) {
    if (previous) {
      const from = previous.t;
      const broken = gapTimes.some((gap) => gap > from && gap < item.t);
      if (broken) {
        segments.push(current);
        current = [];
      }
    }
    current.push(item);
    previous = item;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

const weekdayFormat = new Intl.DateTimeFormat(chartLocale, { weekday: 'narrow' });
const dayMonthFormat = new Intl.DateTimeFormat(chartLocale, { day: 'numeric', month: 'short' });
const shortMonthFormat = new Intl.DateTimeFormat(chartLocale, { month: 'short' });
const narrowMonthFormat = new Intl.DateTimeFormat(chartLocale, { month: 'narrow' });

function startOfDay(t: number): Date {
  const date = new Date(t);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function timeTicks(range: MetricRange, domain: TimeDomain): TimeTick[] {
  const ticks: TimeTick[] = [];
  const cursor = startOfDay(domain.start);

  if (range === 'W') {
    while (cursor.getTime() < domain.end) {
      if (cursor.getTime() >= domain.start) {
        ticks.push({ t: cursor.getTime() + dayMs / 2, label: weekdayFormat.format(cursor) });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return ticks;
  }

  if (range === 'M') {
    while (cursor.getDay() !== 1) cursor.setDate(cursor.getDate() + 1);
    while (cursor.getTime() < domain.end) {
      ticks.push({ t: cursor.getTime(), label: dayMonthFormat.format(cursor) });
      cursor.setDate(cursor.getDate() + 7);
    }
    return ticks;
  }

  const monthFormat = range === '6M' ? shortMonthFormat : narrowMonthFormat;
  cursor.setDate(1);
  if (cursor.getTime() < domain.start) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor.getTime() < domain.end) {
    ticks.push({ t: cursor.getTime(), label: monthFormat.format(cursor) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}
