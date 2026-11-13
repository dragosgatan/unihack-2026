import type { MedicalRecord, MetricId, Patient, Session, SessionPlan, Side } from '@tempo/shared';
import { gaussian, type Random } from './random.ts';

const dayMs = 86_400_000;
const historyDays = 91;

export const daysBefore = (now: Date, days: number, hourUtc = 0): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - days * dayMs + hourUtc * 3_600_000);

export const minutesAfter = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60_000);

export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

export const lerp = (from: number, to: number, fraction: number): number => from + (to - from) * fraction;

export const easeOut = (fraction: number): number => 1 - (1 - fraction) ** 2;

export const fractionBetween = (t: Date, from: Date, to: Date): number =>
  Math.min(1, Math.max(0, (t.getTime() - from.getTime()) / (to.getTime() - from.getTime())));

export type StoryMoment = { t: Date; previous: Date | undefined; progress: number };

export type MetricStory = {
  metricId: MetricId;
  side?: Side;
  mean: (moment: StoryMoment) => number;
  noise: number;
  min: number;
  max: number;
};

export type MetricValue = {
  patientId: string;
  sessionId: string;
  metricId: MetricId;
  side?: Side;
  t: string;
  value: number;
};

export type PatientSeed = {
  patient: Patient;
  record: MedicalRecord;
  plan: SessionPlan;
  sessions: Session[];
  metricValues: MetricValue[];
};

const decimals: Record<MetricId, number> = {
  'finger-tapping.taps-per-second': 1,
  'finger-tapping.variability': 1,
  'finger-tapping.decrement': 1,
  'trail-making-a.time': 1,
  'trail-making-a.errors': 0,
  'trail-making-b.time': 1,
  'trail-making-b.errors': 0,
  'clock-drawing.score': 0,
  'word-recall.immediate': 0,
  'word-recall.delayed': 0,
  'spiral-tracing.deviation': 1,
  'spiral-tracing.tremor-frequency': 1,
  'spiral-tracing.speed': 1,
  'shoulder-raise.peak-angle': 0,
  'shoulder-raise.repetitions': 0,
  'shoulder-raise.smoothness': 2,
  'sit-to-stand.count': 0,
  'sit-to-stand.time-per-repetition': 1,
  'single-leg-squat.depth': 0,
  'single-leg-squat.knee-angle': 0,
  'single-leg-squat.knee-valgus': 0,
  'single-leg-squat.symmetry': 0,
  'pain.intensity': 0,
  'medication.adherence': 0,
  'episodes.count': 0,
};

const scheduledDaysAgo = (latestDaysAgo: number): number[] => {
  const days: number[] = [];
  for (let day = latestDaysAgo, step = 3; day <= historyDays; day += step, step = 7 - step) days.unshift(day);
  return days;
};

const storyValue = (story: MetricStory, moment: StoryMoment, random: Random): number => {
  const raw = story.mean(moment) + gaussian(random) * story.noise;
  const clamped = Math.min(story.max, Math.max(story.min, raw));
  return Number(clamped.toFixed(decimals[story.metricId]));
};

export type HistoryInput = {
  now: Date;
  patientId: string;
  planId: string;
  planVersionAt: (t: Date) => number;
  startedBy: string;
  hourUtc: number;
  latestDaysAgo: number;
  missed: number[];
  random: Random;
  stories: MetricStory[];
};

export const buildHistory = (input: HistoryInput): { sessions: Session[]; metricValues: MetricValue[] } => {
  const times = scheduledDaysAgo(input.latestDaysAgo)
    .filter((_, index) => !input.missed.includes(index))
    .map((day) => daysBefore(input.now, day, input.hourUtc));
  const first = times[0] ?? input.now;
  const last = times[times.length - 1] ?? input.now;
  const sessions: Session[] = [];
  const metricValues: MetricValue[] = [];

  times.forEach((t, index) => {
    const sessionId = `${input.patientId}-sess-${String(index + 1).padStart(3, '0')}`;
    const submittedAt = minutesAfter(t, 25).toISOString();
    sessions.push({
      id: sessionId,
      patientId: input.patientId,
      planId: input.planId,
      planVersion: input.planVersionAt(t),
      mode: 'kiosk',
      status: 'processed',
      partial: false,
      startedBy: input.startedBy,
      createdAt: minutesAfter(t, -10).toISOString(),
      startedAt: t.toISOString(),
      submittedAt,
    });
    const moment: StoryMoment = { t, previous: times[index - 1], progress: fractionBetween(t, first, last) };
    for (const story of input.stories) {
      metricValues.push({
        patientId: input.patientId,
        sessionId,
        metricId: story.metricId,
        ...(story.side ? { side: story.side } : {}),
        t: submittedAt,
        value: storyValue(story, moment, input.random),
      });
    }
  });

  return { sessions, metricValues };
};
