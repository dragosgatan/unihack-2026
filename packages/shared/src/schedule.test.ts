import { describe, expect, it } from 'vitest';
import { localDate, sessionDue } from './schedule.ts';

const last = '2026-11-01T10:00:00.000Z';
const at = (iso: string): Date => new Date(iso);

describe('sessionDue', () => {
  it('spreads the sessions of a week evenly over seven days', () => {
    expect(sessionDue({ sessions: 1, per: 'week' }, last, at(last)).dueAt).toBe('2026-11-08T10:00:00.000Z');
    expect(sessionDue({ sessions: 2, per: 'week' }, last, at(last)).dueAt).toBe('2026-11-04T22:00:00.000Z');
    expect(sessionDue({ sessions: 7, per: 'week' }, last, at(last)).dueAt).toBe('2026-11-02T10:00:00.000Z');
  });

  it('spreads the sessions of a month evenly over thirty days', () => {
    expect(sessionDue({ sessions: 1, per: 'month' }, last, at(last)).dueAt).toBe('2026-12-01T10:00:00.000Z');
    expect(sessionDue({ sessions: 3, per: 'month' }, last, at(last)).dueAt).toBe('2026-11-11T10:00:00.000Z');
  });

  it('counts a session as missed only after a day of grace past its due time', () => {
    const schedule = { sessions: 1, per: 'week' } as const;
    expect(sessionDue(schedule, last, at('2026-11-08T09:59:59.999Z')).missed).toBe(false);
    expect(sessionDue(schedule, last, at('2026-11-08T10:00:00.001Z')).missed).toBe(false);
    expect(sessionDue(schedule, last, at('2026-11-09T10:00:00.000Z')).missed).toBe(false);
    expect(sessionDue(schedule, last, at('2026-11-09T10:00:00.001Z')).missed).toBe(true);
  });
});

describe('localDate', () => {
  const zone = 'Europe/Bucharest';

  it('turns over at local midnight in winter and in summer', () => {
    expect(localDate('2026-11-13T21:59:59.999Z', zone)).toBe('2026-11-13');
    expect(localDate('2026-11-13T22:00:00.000Z', zone)).toBe('2026-11-14');
    expect(localDate(at('2026-07-01T20:59:59.999Z'), zone)).toBe('2026-07-01');
    expect(localDate(at('2026-07-01T21:00:00.000Z'), zone)).toBe('2026-07-02');
  });

  it('follows the clock change in March', () => {
    expect(localDate('2026-03-28T21:59:59.999Z', zone)).toBe('2026-03-28');
    expect(localDate('2026-03-28T22:00:00.000Z', zone)).toBe('2026-03-29');
    expect(localDate('2026-03-29T20:59:59.999Z', zone)).toBe('2026-03-29');
    expect(localDate('2026-03-29T21:00:00.000Z', zone)).toBe('2026-03-30');
  });

  it('follows the clock change in October', () => {
    expect(localDate('2026-10-24T20:59:59.999Z', zone)).toBe('2026-10-24');
    expect(localDate('2026-10-24T21:00:00.000Z', zone)).toBe('2026-10-25');
    expect(localDate('2026-10-25T21:59:59.999Z', zone)).toBe('2026-10-25');
    expect(localDate('2026-10-25T22:00:00.000Z', zone)).toBe('2026-10-26');
  });

  it('reads the date in the zone it is given', () => {
    expect(localDate('2026-11-13T23:30:00.000Z', 'UTC')).toBe('2026-11-13');
    expect(localDate('2026-11-13T23:30:00.000Z', zone)).toBe('2026-11-14');
  });
});
