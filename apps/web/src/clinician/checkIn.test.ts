import { describe, expect, it } from 'vitest';
import type { Flag, Medication, MetricSeries, PatientMetric, TimelineEvent } from '@tempo/shared';
import { timeDomain } from '../ui/index.ts';
import {
  calendarSpans,
  cellsWithEpisodes,
  currentMedications,
  defaultCompareMetric,
  episodeCalendar,
  heatLevel,
  lastCheckIn,
  medicationChanges,
  painRegionCounts,
  sharedDomain,
} from './checkIn.ts';

const latest = new Date(2026, 10, 12, 10).getTime();
const domain = timeDomain('M', latest);

function at(day: number, hour = 10): string {
  return new Date(2026, 10, day, hour).toISOString();
}

function series(metricId: MetricSeries['metricId'], points: MetricSeries['points'], events: MetricSeries['events'] = []): MetricSeries {
  return { metricId, unit: 'count', points, baseline: null, referenceBand: null, events };
}

const fall: TimelineEvent = { id: 'evt-fall', t: at(5, 18), type: 'fall', label: 'Fall at home' };
const doseChange: TimelineEvent = { id: 'evt-med', t: at(8), type: 'medication-change', label: 'Levodopa dose increased' };

describe('shared domain', () => {
  it('ends after the latest point or event across every series', () => {
    const pain = series('pain.intensity', [{ t: at(3), value: 4 }]);
    const episodes = series('episodes.count', [{ t: at(9), value: 1 }], [{ id: 'e', t: at(12), type: 'fall', label: 'Fall' }]);
    expect(sharedDomain('M', [pain, episodes], Date.parse(at(20)))).toEqual(domain);
  });

  it('falls back to now when nothing has data', () => {
    expect(sharedDomain('W', [series('pain.intensity', [])], latest)).toEqual(timeDomain('W', latest));
  });
});

describe('episode calendar', () => {
  it('has one cell per day for a month and one per week for six months', () => {
    const days = calendarSpans('M', domain);
    expect(days).toHaveLength(31);
    expect(days[0]?.start).toBe(domain.start);
    expect(days.at(-1)?.end).toBe(domain.end);
    const weeks = calendarSpans('6M', timeDomain('6M', latest));
    expect(weeks.length).toBeGreaterThanOrEqual(26);
    expect(weeks.length).toBeLessThanOrEqual(27);
  });

  it('sums episode counts per day and marks falls in the same cell', () => {
    const cells = episodeCalendar(
      'M',
      domain,
      [
        { t: at(5, 9), value: 1 },
        { t: at(5, 17), value: 2 },
        { t: at(9), value: 0 },
      ],
      [fall, doseChange],
    );
    const fifth = cells.find((cell) => cell.start === new Date(2026, 10, 5).getTime());
    expect(fifth?.count).toBe(3);
    expect(fifth?.falls).toEqual([fall]);
    expect(cells.reduce((sum, cell) => sum + cell.falls.length, 0)).toBe(1);
  });

  it('buckets a week of episodes into one cell for six months', () => {
    const sixMonths = timeDomain('6M', latest);
    const weekStart = calendarSpans('6M', sixMonths)[3]?.start ?? 0;
    const inWeek = (days: number) => new Date(weekStart + days * 86_400_000 + 3_600_000).toISOString();
    const cells = episodeCalendar('6M', sixMonths, [{ t: inWeek(0), value: 1 }, { t: inWeek(5), value: 1 }], []);
    expect(cells.filter((cell) => cell.count > 0).map((cell) => cell.count)).toEqual([2]);
  });

  it('lists cells with episodes or falls, newest first', () => {
    const cells = episodeCalendar('M', domain, [{ t: at(9), value: 1 }], [fall]);
    expect(cellsWithEpisodes(cells).map((cell) => cell.start)).toEqual([new Date(2026, 10, 9).getTime(), new Date(2026, 10, 5).getTime()]);
  });

  it('steps shade by count', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(heatLevel)).toEqual([0, 1, 2, 3, 3, 4, 4]);
  });
});

describe('pain region counts', () => {
  const base = { patientId: 'pat-1', sessionId: 'sess-1', kind: 'pain-skip', activityId: 'shoulder-raise', stage: 'task' } as const;
  const flags: Flag[] = [
    { ...base, id: 'f1', painLocation: 'right-shoulder', createdAt: at(4) },
    { ...base, id: 'f2', painLocation: 'right-shoulder', createdAt: at(6) },
    { ...base, id: 'f3', painLocation: 'left-knee', createdAt: at(7) },
    { ...base, id: 'f4', painLocation: 'behind the eyes', createdAt: at(7) },
    { ...base, id: 'f5', createdAt: at(7) },
    { ...base, id: 'f6', painLocation: 'back', createdAt: new Date(2026, 8, 1).toISOString() },
    { id: 'f7', patientId: 'pat-1', sessionId: 'sess-1', kind: 'reliable-change', metricId: 'pain.intensity', value: 7, baseline: 3, createdAt: at(7) },
  ];

  it('counts body regions from pain skips in the range, most first', () => {
    expect(painRegionCounts(flags, domain)).toEqual([
      { region: 'right-shoulder', count: 2 },
      { region: 'left-knee', count: 1 },
    ]);
  });
});

describe('medications', () => {
  const medication = (id: string, stopDate?: string): Medication => ({
    id,
    name: id,
    dose: '1 mg',
    frequency: 'daily',
    startDate: '2026-01-01',
    ...(stopDate ? { stopDate } : {}),
  });

  it('keeps medications with no stop date or one in the future', () => {
    const today = new Date(2026, 10, 14, 12);
    const kept = currentMedications([medication('ongoing'), medication('stops-later', '2026-12-01'), medication('stops-today', '2026-11-14'), medication('stopped', '2026-10-01')], today);
    expect(kept.map((entry) => entry.id)).toEqual(['ongoing', 'stops-later']);
  });

  it('lists medication changes in the range, newest first', () => {
    const old: TimelineEvent = { ...doseChange, id: 'old', t: new Date(2026, 5, 1).toISOString() };
    const later: TimelineEvent = { ...doseChange, id: 'later', t: at(11) };
    expect(medicationChanges([old, doseChange, fall, later], domain).map((event) => event.id)).toEqual(['later', 'evt-med']);
  });
});

describe('compare and last check-in', () => {
  const metric = (metricId: PatientMetric['metricId'], lastT?: string): PatientMetric => ({
    metricId,
    unit: 'count',
    lateral: false,
    ...(lastT ? { lastValue: 1, lastT } : {}),
  });

  it('prefers sit to stand, else the first score with data, never a check-in metric', () => {
    expect(defaultCompareMetric([metric('pain.intensity', at(1)), metric('trail-making-a.time'), metric('word-recall.immediate', at(2)), metric('sit-to-stand.count', at(1))])).toBe('sit-to-stand.count');
    expect(defaultCompareMetric([metric('pain.intensity', at(1)), metric('trail-making-a.time'), metric('word-recall.immediate', at(2))])).toBe('word-recall.immediate');
    expect(defaultCompareMetric([metric('pain.intensity', at(1))])).toBeNull();
  });

  it('takes the latest check-in time across check-in metrics', () => {
    expect(lastCheckIn([metric('pain.intensity', at(3)), metric('episodes.count', at(9)), metric('word-recall.immediate', at(12))])).toBe(at(9));
    expect(lastCheckIn([metric('word-recall.immediate', at(12))])).toBeUndefined();
  });
});
