import { describe, expect, it } from 'vitest';
import type { CheckInEntry, Episode, Flag, Medication, MetricSeries, PatientMetric, TimelineEvent } from '@tempo/shared';
import { timeDomain } from '../ui/index.ts';
import {
  calendarSpans,
  cellDetail,
  cellsWithEpisodes,
  currentMedications,
  defaultCompareMetric,
  episodeCalendar,
  heatLevel,
  isSingleDrugAdherence,
  lastCheckIn,
  medicationChanges,
  medicationRows,
  painRegionCounts,
  painTypeTally,
  regionCountText,
  sharedDomain,
  sideEffectReports,
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
function episode(id: string, type: Episode['type'], occurredAt: string, count = 1, source: Episode['source'] = 'home', description?: string): Episode {
  return { id, patientId: 'pat-1', type, count, occurredAt, source, ...(description ? { description } : {}) };
}

function entry(id: string, recordedAt: string, body: CheckInEntry['body']): CheckInEntry {
  return { id, patientId: 'pat-1', recordedAt, recordedBy: { kind: 'patient' }, body };
}

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

  it('includes check-in entry and episode times', () => {
    expect(sharedDomain('M', [series('pain.intensity', [{ t: at(3), value: 4 }])], Date.parse(at(20)), [at(12, 8), at(1)])).toEqual(domain);
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

  it('sums episode counts per day by occurrence and tallies them by type and source', () => {
    const cells = episodeCalendar(
      'M',
      domain,
      [
        episode('e1', 'freezing', at(5, 9), 1, 'home', 'Froze at the door'),
        episode('e2', 'freezing', at(5, 17), 1),
        episode('e3', 'dizziness', at(5, 12), 1, 'check-in'),
        episode('e4', 'freezing', at(9)),
      ],
      [doseChange],
    );
    const fifth = cells.find((cell) => cell.start === new Date(2026, 10, 5).getTime());
    expect(fifth?.count).toBe(3);
    expect(fifth?.tallies).toEqual([
      { type: 'freezing', source: 'home', count: 2 },
      { type: 'dizziness', source: 'check-in', count: 1 },
    ]);
    expect(fifth && cellDetail(fifth)).toBe('2 freezing (home) · 1 dizziness (check-in) · \u201cFroze at the door\u201d');
    expect(fifth?.hasFall).toBe(false);
  });

  it('marks a fall from an episode or from the record timeline', () => {
    const cells = episodeCalendar('M', domain, [episode('e1', 'fall', at(7), 1, 'check-in')], [fall]);
    const withFalls = cells.filter((cell) => cell.hasFall).map((cell) => cell.start);
    expect(withFalls).toEqual([new Date(2026, 10, 5).getTime(), new Date(2026, 10, 7).getTime()]);
    const fifth = cells.find((cell) => cell.start === new Date(2026, 10, 5).getTime());
    expect(fifth?.count).toBe(0);
    expect(fifth && cellDetail(fifth)).toBe('Fall in record: Fall at home');
    const seventh = cells.find((cell) => cell.start === new Date(2026, 10, 7).getTime());
    expect(seventh && cellDetail(seventh)).toBe('1 fall (check-in)');
  });

  it('buckets a week of episodes into one cell for six months', () => {
    const sixMonths = timeDomain('6M', latest);
    const weekStart = calendarSpans('6M', sixMonths)[3]?.start ?? 0;
    const inWeek = (days: number) => new Date(weekStart + days * 86_400_000 + 3_600_000).toISOString();
    const cells = episodeCalendar('6M', sixMonths, [episode('a', 'spasm', inWeek(0)), episode('b', 'spasm', inWeek(5), 2)], []);
    expect(cells.filter((cell) => cell.count > 0).map((cell) => cell.count)).toEqual([3]);
  });

  it('lists cells with episodes or falls, newest first', () => {
    const cells = episodeCalendar('M', domain, [episode('e', 'confusion', at(9))], [fall]);
    expect(cells[0] && cellDetail(cells[0])).toBe('No episodes');
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

  const entries: CheckInEntry[] = [
    entry('c1', at(3), { item: 'pain', intensity: 4, location: 'right-shoulder', type: 'ache' }),
    entry('c2', at(5), { item: 'pain', intensity: 5, location: 'back', type: 'sharp' }),
    entry('c3', at(6), { item: 'pain', intensity: 3, location: 'back', type: 'ache' }),
    entry('c4', at(8), { item: 'pain', intensity: 2, location: 'somewhere', type: 'burning' }),
    entry('c5', at(9), { item: 'pain', intensity: 0 }),
    entry('c6', new Date(2026, 8, 1).toISOString(), { item: 'pain', intensity: 6, location: 'back', type: 'phantom-limb' }),
    entry('c7', at(9), { item: 'medication', medications: [] }),
  ];

  it('counts body regions from pain skips in the range, most first', () => {
    expect(painRegionCounts([], flags, domain)).toEqual([
      { region: 'right-shoulder', checkIns: 0, stopped: 2 },
      { region: 'left-knee', checkIns: 0, stopped: 1 },
    ]);
  });

  it('adds check-in locations that are body regions and keeps the split', () => {
    const counts = painRegionCounts(entries, flags, domain);
    expect(counts).toEqual([
      { region: 'right-shoulder', checkIns: 1, stopped: 2 },
      { region: 'back', checkIns: 2, stopped: 0 },
      { region: 'left-knee', checkIns: 0, stopped: 1 },
    ]);
    expect(counts.map(regionCountText)).toEqual(['1 check-in, 2 stopped activities', '2 check-ins', '1 stopped activity']);
  });

  it('tallies pain types in the range, only those that occur', () => {
    expect(painTypeTally(entries, domain)).toEqual([
      { type: 'ache', count: 2 },
      { type: 'sharp', count: 1 },
      { type: 'burning', count: 1 },
    ]);
  });
});

describe('per-medication check-ins', () => {
  const recorded: Medication[] = [{ id: 'med-1', name: 'Levodopa/Carbidopa', dose: '100/25 mg', frequency: 'three times daily', startDate: '2025-01-01' }];
  const entries: CheckInEntry[] = [
    entry('m2', at(6), {
      item: 'medication',
      medications: [
        { medicationId: 'med-1', name: 'Levodopa', status: 'stopped' },
        { medicationId: 'med-9', name: 'Amantadine', status: 'missed', sideEffects: 'Dry mouth' },
      ],
    }),
    entry('m1', at(3), { item: 'medication', medications: [{ medicationId: 'med-1', name: 'Levodopa', status: 'taken', sideEffects: 'Felt sick after the morning dose' }] }),
    entry('m0', new Date(2026, 8, 1).toISOString(), { item: 'medication', medications: [{ medicationId: 'med-8', name: 'Old drug', status: 'taken' }] }),
    entry('p1', at(4), { item: 'pain', intensity: 2 }),
  ];

  it('makes one row per drug in the range with one mark per check-in, labelled from the record when it matches', () => {
    const rows = medicationRows(entries, recorded, domain);
    expect(rows.map((row) => [row.medicationId, row.label, row.detail])).toEqual([
      ['med-1', 'Levodopa/Carbidopa', '100/25 mg · three times daily'],
      ['med-9', 'Amantadine', undefined],
    ]);
    expect(rows[0]?.marks.map((mark) => [mark.entryId, mark.status])).toEqual([
      ['m1', 'taken'],
      ['m2', 'stopped'],
    ]);
  });

  it('lists side effects newest first in the patient words', () => {
    expect(sideEffectReports(medicationRows(entries, recorded, domain)).map((report) => [report.t, report.drug, report.text])).toEqual([
      [at(6), 'Amantadine', 'Dry mouth'],
      [at(3), 'Levodopa/Carbidopa 100/25 mg · three times daily', 'Felt sick after the morning dose'],
    ]);
  });

  it('detects a single countable drug per check-in, leaving stopped drugs out', () => {
    expect(isSingleDrugAdherence(entries, domain)).toBe(true);
    const two = entry('m3', at(8), {
      item: 'medication',
      medications: [
        { medicationId: 'med-1', name: 'Levodopa', status: 'taken' },
        { medicationId: 'med-9', name: 'Amantadine', status: 'missed' },
      ],
    });
    expect(isSingleDrugAdherence([...entries, two], domain)).toBe(false);
    expect(isSingleDrugAdherence([entry('m4', at(8), { item: 'medication', medications: [{ medicationId: 'med-1', name: 'L', status: 'stopped' }] })], domain)).toBe(false);
    expect(isSingleDrugAdherence([], domain)).toBe(false);
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
