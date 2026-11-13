import type { MedicalRecord, Patient, SessionPlan } from '@tempo/shared';
import {
  buildHistory,
  daysBefore,
  easeOut,
  fractionBetween,
  isoDate,
  lerp,
  type MetricStory,
  type PatientSeed,
  type StoryMoment,
} from './history.ts';
import { attending, institution } from './institution.ts';
import { mulberry32 } from './random.ts';

export const parkinsonsPatientId = 'pat-1';

export const buildParkinsonsPatient = (now: Date): PatientSeed => {
  const historyStart = daysBefore(now, 91);
  const fall = daysBefore(now, 60, 17);
  const levodopaChange = daysBefore(now, 42, 8);
  const planChange = daysBefore(now, 30, 9);

  const trend =
    (start: number, worst: number, end: number) =>
    ({ t }: StoryMoment): number =>
      t < levodopaChange
        ? lerp(start, worst, fractionBetween(t, historyStart, levodopaChange))
        : lerp(worst, end, easeOut(fractionBetween(t, levodopaChange, now)));

  const patient: Patient = {
    id: parkinsonsPatientId,
    institutionId: institution.id,
    institutionPatientId: 'RRC-00417',
    name: 'Elena Dorian',
    dateOfBirth: '1951-04-22',
    sex: 'female',
    profile: 'neurological',
    attendingId: attending.id,
    therapistIds: [],
    createdAt: daysBefore(now, 95, 9).toISOString(),
  };

  const record: MedicalRecord = {
    patientId: patient.id,
    yearsOfEducation: 12,
    dominantHand: 'right',
    affectedLimbs: [{ limb: 'arm', side: 'right', prosthesis: false }],
    diagnoses: [{ code: 'G20', label: "Parkinson's disease" }],
    medications: [
      {
        id: 'med-1',
        name: 'Levodopa/Carbidopa',
        rxnormId: '197444',
        dose: '100/25 mg',
        frequency: 'three times daily',
        startDate: '2025-03-10',
        stopDate: isoDate(levodopaChange),
      },
      {
        id: 'med-2',
        name: 'Levodopa/Carbidopa',
        rxnormId: '197444',
        dose: '100/25 mg',
        frequency: 'four times daily',
        startDate: isoDate(levodopaChange),
      },
    ],
    limitations: ['vision'],
    clinicalNotes: 'Mild resting tremor, right side. Uses a walking frame outdoors.',
    rehabGoals: ['Walk to the shop without a frame', 'Dress independently in the morning'],
    timeline: [
      { id: 'evt-2', t: fall.toISOString(), type: 'fall', label: 'Fall at home, no injury reported' },
      { id: 'evt-1', t: levodopaChange.toISOString(), type: 'medication-change', label: 'Levodopa dose increased' },
      { id: 'evt-3', t: planChange.toISOString(), type: 'plan-change', label: 'Sit-to-stand target raised to 10' },
    ],
    updatedAt: planChange.toISOString(),
    updatedBy: attending.id,
  };

  const plan: SessionPlan = {
    id: 'plan-1',
    version: 2,
    changeReason: 'Sit-to-stand target raised from 8 to 10 repetitions',
    patientId: patient.id,
    items: [
      { activityId: 'check-in-pain', kind: 'check-in', config: {} },
      { activityId: 'check-in-medication', kind: 'check-in', config: {} },
      { activityId: 'check-in-episodes', kind: 'check-in', config: {} },
      { activityId: 'finger-tapping', kind: 'test', config: { sides: ['right', 'left'], trialDurationMs: 15000 } },
      { activityId: 'trail-making-a', kind: 'test', config: {} },
      { activityId: 'trail-making-b', kind: 'test', config: {} },
      { activityId: 'clock-drawing', kind: 'test', config: {} },
      { activityId: 'word-recall', kind: 'test', config: {} },
      { activityId: 'spiral-tracing', kind: 'test', config: {} },
      { activityId: 'sit-to-stand', kind: 'exercise', config: {}, targetRepetitions: 10 },
    ],
    schedule: { sessions: 2, per: 'week' },
    language: 'ro',
    createdBy: attending.id,
    updatedAt: planChange.toISOString(),
  };

  const stories: MetricStory[] = [
    { metricId: 'finger-tapping.taps-per-second', side: 'right', mean: trend(3.6, 3.1, 4.0), noise: 0.15, min: 0.5, max: 10 },
    { metricId: 'finger-tapping.taps-per-second', side: 'left', mean: trend(4.6, 4.4, 4.8), noise: 0.15, min: 0.5, max: 10 },
    { metricId: 'finger-tapping.variability', side: 'right', mean: trend(17, 22, 13), noise: 1.5, min: 0, max: 100 },
    { metricId: 'finger-tapping.variability', side: 'left', mean: trend(11, 12, 10), noise: 1.2, min: 0, max: 100 },
    { metricId: 'finger-tapping.decrement', side: 'right', mean: trend(18, 26, 14), noise: 2, min: 0, max: 100 },
    { metricId: 'finger-tapping.decrement', side: 'left', mean: trend(9, 11, 8), noise: 1.5, min: 0, max: 100 },
    { metricId: 'trail-making-a.time', mean: trend(52, 60, 50), noise: 4, min: 10, max: 300 },
    { metricId: 'trail-making-a.errors', mean: trend(0.6, 1.2, 0.4), noise: 0.7, min: 0, max: 10 },
    { metricId: 'trail-making-b.time', mean: trend(128, 145, 124), noise: 8, min: 20, max: 600 },
    { metricId: 'trail-making-b.errors', mean: trend(1.2, 2, 1), noise: 0.8, min: 0, max: 10 },
    { metricId: 'clock-drawing.score', mean: trend(2.6, 2.2, 2.6), noise: 0.4, min: 0, max: 3 },
    { metricId: 'word-recall.immediate', mean: trend(4.3, 4, 4.3), noise: 0.5, min: 0, max: 5 },
    { metricId: 'word-recall.delayed', mean: trend(3, 2.6, 3), noise: 0.6, min: 0, max: 5 },
    { metricId: 'spiral-tracing.deviation', side: 'right', mean: trend(4.2, 5.4, 3.6), noise: 0.4, min: 0, max: 50 },
    { metricId: 'spiral-tracing.deviation', side: 'left', mean: trend(2.6, 2.8, 2.5), noise: 0.3, min: 0, max: 50 },
    { metricId: 'spiral-tracing.tremor-frequency', side: 'right', mean: trend(5.1, 5.3, 4.9), noise: 0.25, min: 0, max: 15 },
    { metricId: 'spiral-tracing.tremor-frequency', side: 'left', mean: trend(4.6, 4.7, 4.5), noise: 0.3, min: 0, max: 15 },
    { metricId: 'spiral-tracing.speed', side: 'right', mean: trend(17, 14, 20), noise: 1.5, min: 1, max: 100 },
    { metricId: 'spiral-tracing.speed', side: 'left', mean: trend(23, 22, 24), noise: 1.5, min: 1, max: 100 },
    { metricId: 'sit-to-stand.count', mean: trend(9, 7, 10), noise: 0.8, min: 0, max: 30 },
    { metricId: 'sit-to-stand.time-per-repetition', mean: trend(3.3, 4.2, 3), noise: 0.25, min: 0.5, max: 15 },
    { metricId: 'pain.intensity', mean: trend(2, 3, 2), noise: 0.8, min: 0, max: 10 },
    { metricId: 'medication.adherence', mean: trend(88, 80, 97), noise: 4, min: 0, max: 100 },
    {
      metricId: 'episodes.count',
      mean: ({ t, previous }) => (previous !== undefined && previous < fall && fall <= t ? 1 : 0),
      noise: 0,
      min: 0,
      max: 20,
    },
  ];

  const history = buildHistory({
    now,
    patientId: patient.id,
    planId: plan.id,
    planVersionAt: (t) => (t < planChange ? 1 : 2),
    startedBy: attending.id,
    hourUtc: 8,
    latestDaysAgo: 1,
    missed: [6, 15],
    random: mulberry32(101),
    stories,
  });

  return { patient, record, plan, ...history };
};
