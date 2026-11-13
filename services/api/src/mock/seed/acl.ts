import type { MedicalRecord, Patient, SessionPlan } from '@tempo/shared';
import { buildHistory, daysBefore, easeOut, isoDate, lerp, type MetricStory, type PatientSeed } from './history.ts';
import { attending, institution, therapist } from './institution.ts';
import { mulberry32 } from './random.ts';

export const aclPatientId = 'pat-3';

export const buildAclPatient = (now: Date): PatientSeed => {
  const injury = daysBefore(now, 119, 18);
  const surgery = daysBefore(now, 98, 8);
  const crutchesOff = daysBefore(now, 77, 12);
  const phaseChange = daysBefore(now, 28, 10);

  const recovery =
    (start: number, end: number) =>
    ({ progress }: { progress: number }): number =>
      lerp(start, end, easeOut(progress));
  const steady = (value: number) => (): number => value;

  const patient: Patient = {
    id: aclPatientId,
    institutionId: institution.id,
    institutionPatientId: 'RRC-00488',
    name: 'Andrei Popa',
    dateOfBirth: '2001-03-09',
    sex: 'male',
    profile: 'sports',
    attendingId: attending.id,
    therapistIds: [therapist.id],
    createdAt: daysBefore(now, 97, 14).toISOString(),
  };

  const record: MedicalRecord = {
    patientId: patient.id,
    yearsOfEducation: 15,
    dominantHand: 'right',
    affectedLimbs: [{ limb: 'leg', side: 'right', prosthesis: false }],
    injury: {
      structure: 'Anterior cruciate ligament',
      side: 'right',
      dateOfInjury: isoDate(injury),
      surgery: { date: isoDate(surgery), type: 'ACL reconstruction, hamstring tendon graft' },
      sport: { name: 'Football', level: 'competitive' },
      rehabPhase: {
        name: 'Strength and neuromuscular control',
        enteredAt: isoDate(phaseChange),
        targets: [
          { label: 'Full knee extension', met: true },
          { label: 'No swelling after training', met: true },
          { label: 'Single-leg squat symmetry above 90%', met: false },
          { label: 'Knee valgus under 5° on single-leg squat', met: false },
        ],
      },
      phaseHistory: [
        {
          name: 'Early rehabilitation',
          enteredAt: isoDate(daysBefore(now, 97)),
          completedAt: isoDate(phaseChange),
          targets: [
            { label: 'Walking without crutches', met: true },
            { label: 'Knee flexion to 120°', met: true },
            { label: 'Straight-leg raise without extension lag', met: true },
          ],
          decidedBy: therapist.id,
        },
      ],
    },
    diagnoses: [{ code: 'S83.511A', label: 'Sprain of anterior cruciate ligament of right knee, initial encounter' }],
    medications: [],
    limitations: [],
    clinicalNotes: 'Right ACL reconstruction with hamstring graft. Competitive footballer, aiming to return to team training.',
    rehabGoals: ['Return to team training', 'Single-leg squat symmetry above 90%'],
    timeline: [
      { id: 'evt-7', t: surgery.toISOString(), type: 'surgery', label: 'ACL reconstruction, right knee' },
      { id: 'evt-8', t: crutchesOff.toISOString(), type: 'milestone', label: 'Walking without crutches' },
      { id: 'evt-9', t: phaseChange.toISOString(), type: 'phase-change', label: 'Moved to strength and neuromuscular control' },
    ],
    updatedAt: phaseChange.toISOString(),
    updatedBy: therapist.id,
  };

  const plan: SessionPlan = {
    id: 'plan-3',
    version: 1,
    patientId: patient.id,
    items: [
      { activityId: 'check-in-pain', kind: 'check-in', config: {} },
      { activityId: 'single-leg-squat', kind: 'exercise', config: {}, targetRepetitions: 8 },
      { activityId: 'sit-to-stand', kind: 'exercise', config: {}, targetRepetitions: 15 },
    ],
    schedule: { sessions: 2, per: 'week' },
    language: 'en',
    createdBy: therapist.id,
    updatedAt: daysBefore(now, 95, 10).toISOString(),
  };

  const stories: MetricStory[] = [
    { metricId: 'single-leg-squat.depth', side: 'right', mean: recovery(28, 56), noise: 2.5, min: 0, max: 100 },
    { metricId: 'single-leg-squat.depth', side: 'left', mean: steady(62), noise: 2, min: 0, max: 100 },
    { metricId: 'single-leg-squat.knee-angle', side: 'right', mean: recovery(45, 82), noise: 3, min: 0, max: 180 },
    { metricId: 'single-leg-squat.knee-angle', side: 'left', mean: steady(88), noise: 2, min: 0, max: 180 },
    { metricId: 'single-leg-squat.knee-valgus', side: 'right', mean: recovery(12, 6), noise: 1, min: 0, max: 45 },
    { metricId: 'single-leg-squat.knee-valgus', side: 'left', mean: steady(5), noise: 0.8, min: 0, max: 45 },
    { metricId: 'single-leg-squat.symmetry', mean: recovery(62, 91), noise: 1.5, min: 0, max: 100 },
    { metricId: 'sit-to-stand.count', mean: recovery(12, 17), noise: 1, min: 0, max: 30 },
    { metricId: 'sit-to-stand.time-per-repetition', mean: recovery(2.5, 1.8), noise: 0.15, min: 0.5, max: 15 },
    { metricId: 'pain.intensity', mean: recovery(4.5, 1), noise: 0.7, min: 0, max: 10 },
  ];

  const history = buildHistory({
    now,
    patientId: patient.id,
    planId: plan.id,
    planVersionAt: () => plan.version,
    startedBy: therapist.id,
    hourUtc: 15,
    latestDaysAgo: 3,
    missed: [5, 20],
    random: mulberry32(303),
    stories,
  });

  return { patient, record, plan, ...history };
};
