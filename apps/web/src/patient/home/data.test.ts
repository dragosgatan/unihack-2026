import { describe, expect, it } from 'vitest';
import type { SessionPlan, SubmittedResult } from '@tempo/shared';
import { checkInStreak, dueToday, homeDataSchema, recordFinished, weekRepetitions, type HomeData } from './data.ts';

const tz = 'Europe/Bucharest';
const now = new Date('2026-11-14T10:00:00.000Z');
const empty: HomeData = { checkIns: [], pain: [], exercises: [] };

const plan: SessionPlan = {
  id: 'plan-1',
  version: 1,
  patientId: 'pat-1',
  items: [
    { activityId: 'check-in-pain', kind: 'check-in', config: {} },
    { activityId: 'sit-to-stand', kind: 'exercise', config: {} },
    { activityId: 'finger-tapping', kind: 'test', config: {} },
  ],
  schedule: { sessions: 2, per: 'week' },
  language: 'en',
  createdBy: 'staff-1',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const rep = { startMs: 0, endMs: 1000 };
const results: SubmittedResult[] = [
  { status: 'completed', raw: { activityId: 'check-in-pain', data: { item: 'pain', intensity: 4 } }, completedAt: now.toISOString() },
  { status: 'completed', raw: { activityId: 'sit-to-stand', data: { durationMs: 30_000, reps: [rep, rep, rep] } }, completedAt: now.toISOString() },
  {
    status: 'completed',
    raw: { activityId: 'shoulder-raise', data: { trials: [{ side: 'left', reps: [{ ...rep, angles: [90] }] }, { side: 'right', reps: [{ ...rep, angles: [80] }] }] } },
    completedAt: now.toISOString(),
  },
  { status: 'skipped', activityId: 'finger-tapping', reason: 'tired', stage: 'instructions', skippedAt: now.toISOString() },
];

describe('recordFinished', () => {
  it('keeps pain, repetitions and check-in time, and no test data', () => {
    const data = recordFinished(empty, results, now);
    expect(homeDataSchema.parse(data)).toEqual({
      checkIns: [now.toISOString()],
      lastSessionAt: now.toISOString(),
      pain: [{ t: now.toISOString(), intensity: 4 }],
      exercises: [
        { t: now.toISOString(), activityId: 'sit-to-stand', repetitions: 3 },
        { t: now.toISOString(), activityId: 'shoulder-raise', repetitions: 2 },
      ],
    });
  });

  it('leaves the last session alone after a check-in only, and drops entries older than 30 days', () => {
    const old = '2026-10-01T10:00:00.000Z';
    const before = { ...empty, lastSessionAt: old, checkIns: [old], pain: [{ t: old, intensity: 2 }] };
    const data = recordFinished(before, results.slice(0, 1), now);
    expect(data.lastSessionAt).toBe(old);
    expect(data.checkIns).toEqual([now.toISOString()]);
    expect(data.pain).toEqual([{ t: now.toISOString(), intensity: 4 }]);
  });
});

describe('dueToday', () => {
  it('lists everything before the first session', () => {
    expect(dueToday(plan, empty, now, tz)).toEqual(plan.items);
  });

  it('drops the check-in once done today and the tests until the schedule says so', () => {
    const data = { ...empty, checkIns: ['2026-11-14T07:00:00.000Z'], lastSessionAt: '2026-11-13T09:00:00.000Z' };
    expect(dueToday(plan, data, now, tz)).toEqual([]);
  });

  it('brings tests back on the day the schedule falls due, in local time', () => {
    const data = { ...empty, checkIns: ['2026-11-13T22:30:00.000Z'], lastSessionAt: '2026-11-10T10:00:00.000Z' };
    expect(dueToday(plan, data, now, tz).map((item) => item.activityId)).toEqual(['sit-to-stand', 'finger-tapping']);
  });
});

describe('checkInStreak', () => {
  it('counts days in a row and does not break before today is done', () => {
    const checkIns = ['2026-11-13T08:00:00.000Z', '2026-11-12T20:00:00.000Z', '2026-11-11T08:00:00.000Z', '2026-11-09T08:00:00.000Z'];
    expect(checkInStreak(checkIns, now, tz)).toBe(3);
    expect(checkInStreak(['2026-11-14T08:00:00.000Z', ...checkIns], now, tz)).toBe(4);
    expect(checkInStreak(['2026-11-11T08:00:00.000Z'], now, tz)).toBe(0);
  });
});

describe('weekRepetitions', () => {
  it('sums the last seven days per exercise', () => {
    const exercises = [
      { t: '2026-11-14T08:00:00.000Z', activityId: 'sit-to-stand' as const, repetitions: 5 },
      { t: '2026-11-10T08:00:00.000Z', activityId: 'sit-to-stand' as const, repetitions: 4 },
      { t: '2026-11-01T08:00:00.000Z', activityId: 'sit-to-stand' as const, repetitions: 9 },
    ];
    expect(weekRepetitions(exercises, now)).toEqual([['sit-to-stand', 9]]);
  });
});
