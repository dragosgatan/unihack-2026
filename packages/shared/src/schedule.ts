import type { IsoDate, IsoDateTime } from './common.ts';
import type { SessionPlan } from './session.ts';

export type SessionSchedule = SessionPlan['schedule'];
export type SessionDue = { dueAt: IsoDateTime; missed: boolean };

const dayMs = 24 * 60 * 60 * 1000;
const periodDays = { week: 7, month: 30 } as const;

const missedSessionGraceMs = dayMs;

const sessionIntervalMs = ({ sessions, per }: SessionSchedule): number => (periodDays[per] * dayMs) / sessions;

export const sessionDue = (schedule: SessionSchedule, lastSessionAt: IsoDateTime, now: Date): SessionDue => {
  const dueAt = Date.parse(lastSessionAt) + sessionIntervalMs(schedule);
  return { dueAt: new Date(dueAt).toISOString(), missed: now.getTime() > dueAt + missedSessionGraceMs };
};

export const localDate = (instant: Date | IsoDateTime, timeZone: string): IsoDate => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(typeof instant === 'string' ? new Date(instant) : instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
