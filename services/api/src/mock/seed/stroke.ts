import type { MedicalRecord, Patient, SessionPlan } from '@tempo/shared';
import { painEntries } from './check-ins.ts';
import { buildHistory, daysBefore, easeOut, isoDate, lerp, type MetricStory, type PatientSeed } from './history.ts';
import { attending, institution, therapist } from './institution.ts';
import { mulberry32 } from './random.ts';

export const strokePatientId = 'pat-2';

export const buildStrokePatient = (now: Date): PatientSeed => {
  const stroke = daysBefore(now, 105, 6);
  const planChange = daysBefore(now, 35, 10);
  const armMilestone = daysBefore(now, 18, 11);

  const recovery =
    (start: number, end: number) =>
    ({ progress }: { progress: number }): number =>
      lerp(start, end, easeOut(progress));
  const steady = (value: number) => (): number => value;

  const patient: Patient = {
    id: strokePatientId,
    institutionId: institution.id,
    institutionPatientId: 'RRC-00452',
    name: 'Vasile Petrescu',
    dateOfBirth: '1958-06-14',
    sex: 'male',
    profile: 'neurological',
    attendingId: attending.id,
    therapistIds: [therapist.id],
    createdAt: daysBefore(now, 96, 10).toISOString(),
    reminderEmail: 'vasile.petrescu@example.test',
  };

  const record: MedicalRecord = {
    patientId: patient.id,
    yearsOfEducation: 10,
    dominantHand: 'right',
    affectedLimbs: [
      { limb: 'arm', side: 'right', prosthesis: false },
      { limb: 'hand', side: 'right', prosthesis: false },
    ],
    diagnoses: [{ code: 'I63.9', label: 'Cerebral infarction, unspecified' }],
    medications: [
      {
        id: 'med-3',
        name: 'Clopidogrel',
        rxnormId: '309362',
        dose: '75 mg',
        frequency: 'once daily',
        startDate: isoDate(stroke),
      },
      {
        id: 'med-4',
        name: 'Atorvastatin',
        rxnormId: '617311',
        dose: '40 mg',
        frequency: 'once daily, evening',
        startDate: isoDate(stroke),
      },
    ],
    limitations: ['speech'],
    clinicalNotes: 'Right-sided weakness after ischaemic stroke. Mild expressive aphasia; follows spoken instructions.',
    rehabGoals: ['Lift a cup to shoulder height with the right arm', 'Button a shirt independently'],
    timeline: [
      { id: 'evt-4', t: stroke.toISOString(), type: 'other', label: 'Ischaemic stroke' },
      { id: 'evt-5', t: planChange.toISOString(), type: 'plan-change', label: 'Shoulder raise target raised to 110°' },
      { id: 'evt-6', t: armMilestone.toISOString(), type: 'milestone', label: 'Right arm raised above shoulder height' },
    ],
    updatedAt: armMilestone.toISOString(),
    updatedBy: attending.id,
  };

  const plan: SessionPlan = {
    id: 'plan-2',
    version: 2,
    changeReason: 'Shoulder raise target raised from 90° to 110°',
    patientId: patient.id,
    items: [
      { activityId: 'check-in-pain', kind: 'check-in', config: {} },
      { activityId: 'check-in-medication', kind: 'check-in', config: {} },
      { activityId: 'finger-tapping', kind: 'test', config: { sides: ['right', 'left'], trialDurationMs: 15000 } },
      { activityId: 'trail-making-a', kind: 'test', config: {} },
      { activityId: 'shoulder-raise', kind: 'exercise', config: {}, targetRepetitions: 10, targetAngle: 110, side: 'right' },
      { activityId: 'shoulder-raise', kind: 'exercise', config: {}, targetRepetitions: 10, targetAngle: 150, side: 'left' },
      { activityId: 'sit-to-stand', kind: 'exercise', config: {}, targetRepetitions: 10 },
    ],
    schedule: { sessions: 2, per: 'week' },
    language: 'en',
    createdBy: therapist.id,
    updatedAt: planChange.toISOString(),
  };

  const stories: MetricStory[] = [
    { metricId: 'shoulder-raise.peak-angle', side: 'right', mean: recovery(70, 115), noise: 4, min: 0, max: 180 },
    { metricId: 'shoulder-raise.peak-angle', side: 'left', mean: steady(150), noise: 3, min: 0, max: 180 },
    { metricId: 'shoulder-raise.repetitions', side: 'right', mean: recovery(5, 10), noise: 0.7, min: 0, max: 30 },
    { metricId: 'shoulder-raise.repetitions', side: 'left', mean: steady(10.4), noise: 0.5, min: 0, max: 30 },
    { metricId: 'shoulder-raise.smoothness', side: 'right', mean: recovery(0.42, 0.74), noise: 0.04, min: 0, max: 1 },
    { metricId: 'shoulder-raise.smoothness', side: 'left', mean: steady(0.86), noise: 0.03, min: 0, max: 1 },
    { metricId: 'finger-tapping.taps-per-second', side: 'right', mean: recovery(2.6, 4.1), noise: 0.15, min: 0.5, max: 10 },
    { metricId: 'finger-tapping.taps-per-second', side: 'left', mean: steady(4.7), noise: 0.15, min: 0.5, max: 10 },
    { metricId: 'finger-tapping.variability', side: 'right', mean: recovery(24, 15), noise: 1.5, min: 0, max: 100 },
    { metricId: 'finger-tapping.variability', side: 'left', mean: steady(11), noise: 1.2, min: 0, max: 100 },
    { metricId: 'finger-tapping.decrement', side: 'right', mean: recovery(22, 12), noise: 2, min: 0, max: 100 },
    { metricId: 'finger-tapping.decrement', side: 'left', mean: steady(9), noise: 1.5, min: 0, max: 100 },
    { metricId: 'trail-making-a.time', mean: recovery(78, 61), noise: 4, min: 10, max: 300 },
    { metricId: 'trail-making-a.errors', mean: recovery(1.5, 0.5), noise: 0.7, min: 0, max: 10 },
    { metricId: 'sit-to-stand.count', mean: recovery(7, 11), noise: 0.8, min: 0, max: 30 },
    { metricId: 'sit-to-stand.time-per-repetition', mean: recovery(4.3, 2.9), noise: 0.25, min: 0.5, max: 15 },
    { metricId: 'pain.intensity', mean: recovery(3.4, 1.2), noise: 0.7, min: 0, max: 10 },
    { metricId: 'medication.adherence', mean: steady(94), noise: 4, min: 0, max: 100 },
  ];

  const history = buildHistory({
    now,
    patientId: patient.id,
    planId: plan.id,
    planVersionAt: (t) => (t < planChange ? 1 : 2),
    startedBy: therapist.id,
    hourUtc: 9,
    latestDaysAgo: 2,
    missed: [9, 18],
    random: mulberry32(202),
    stories,
  });

  return {
    patient,
    record,
    plan,
    ...history,
    checkIns: painEntries(history.metricValues, 'right-shoulder', (index) => (index % 4 === 3 ? 'sharp' : 'ache')),
    episodes: [],
    results: [],
    flags: [],
  };
};
