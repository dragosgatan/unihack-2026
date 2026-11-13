import type { FingerTappingRawResult, RawResult } from './activity.ts';
import type { Institution, Patient, Staff } from './entities.ts';
import type { MetricSeries } from './metrics.ts';
import type { MedicalRecord, TimelineEvent } from './record.ts';
import type { Session, SessionPlan } from './session.ts';

export const institution = {
  id: 'inst-1',
  name: 'Riverside Rehabilitation Centre',
  timezone: 'Europe/Bucharest',
} satisfies Institution;

export const attending = {
  id: 'staff-att-1',
  institutionId: institution.id,
  role: 'attending',
  name: 'Dr. Mara Velescu',
  email: 'mara.velescu@example.test',
} satisfies Staff;

export const therapist = {
  id: 'staff-ther-1',
  institutionId: institution.id,
  role: 'therapist',
  name: 'Tomas Ilie',
  email: 'tomas.ilie@example.test',
} satisfies Staff;

export const patient = {
  id: 'pat-1',
  institutionId: institution.id,
  institutionPatientId: 'RRC-00417',
  name: 'Elena Dorian',
  dateOfBirth: '1951-04-22',
  sex: 'female',
  profile: 'neurological',
  attendingId: attending.id,
  therapistIds: [therapist.id],
  createdAt: '2026-08-02T09:15:00.000Z',
} satisfies Patient;

export const levodopaChange = {
  id: 'evt-1',
  t: '2026-10-01T08:00:00.000Z',
  type: 'medication-change',
  label: 'Levodopa dose increased',
} satisfies TimelineEvent;

export const medicalRecord = {
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
    },
  ],
  limitations: ['vision'],
  clinicalNotes: 'Mild resting tremor, right side.',
  rehabGoals: ['Walk to the shop without a frame'],
  timeline: [levodopaChange],
  updatedAt: '2026-10-01T08:05:00.000Z',
  updatedBy: attending.id,
} satisfies MedicalRecord;

export const sessionPlan = {
  id: 'plan-1',
  patientId: patient.id,
  items: [
    { activityId: 'check-in-pain', kind: 'check-in', config: {} },
    { activityId: 'finger-tapping', kind: 'test', config: { sides: ['right', 'left'], trialDurationMs: 15000 } },
    { activityId: 'shoulder-raise', kind: 'exercise', config: {}, targetRepetitions: 10, targetAngle: 120, side: 'right' },
  ],
  schedule: { sessionsPerWeek: 2 },
  language: 'ro',
  createdBy: attending.id,
  updatedAt: '2026-10-01T08:10:00.000Z',
} satisfies SessionPlan;

export const session = {
  id: 'sess-1',
  patientId: patient.id,
  planId: sessionPlan.id,
  mode: 'kiosk',
  status: 'created',
  partial: false,
  startedBy: therapist.id,
  createdAt: '2026-11-13T10:00:00.000Z',
} satisfies Session;

export const fingerTappingRaw = {
  trials: [
    {
      side: 'right',
      prosthesis: false,
      durationMs: 15000,
      taps: [
        { t: 210, target: 'a', x: 102, y: 340 },
        { t: 455, target: 'b', x: 288, y: 338 },
        { t: 702, target: 'a', x: 99, y: 344 },
      ],
    },
    {
      side: 'left',
      prosthesis: false,
      durationMs: 15000,
      taps: [{ t: 260, target: 'a', x: 105, y: 342 }],
    },
  ],
} satisfies FingerTappingRawResult;

export const fingerTappingResult = {
  activityId: 'finger-tapping',
  data: fingerTappingRaw,
} satisfies RawResult;

export const tapsPerSecondSeries = {
  metricId: 'finger-tapping.taps-per-second',
  unit: 'taps/s',
  points: [
    { t: '2026-09-15T10:00:00.000Z', value: 3.9 },
    { t: '2026-11-13T10:20:00.000Z', value: 4.4 },
  ],
  baseline: 4.1,
  referenceBand: { low: 4.5, high: 6.5 },
  events: [levodopaChange],
} satisfies MetricSeries;
