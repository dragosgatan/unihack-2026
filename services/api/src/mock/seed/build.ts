import type { Institution, MedicalRecord, Patient, Session, SessionPlan, Staff, Suggestion } from '@tempo/shared';
import { aclPatientId, buildAclPatient } from './acl.ts';
import type { MetricValue } from '../../store/types.ts';
import { admin, attending, institution, therapist } from './institution.ts';
import { buildParkinsonsPatient, buildParkinsonsSuggestion, parkinsonsPatientId } from './parkinsons.ts';
import { buildStrokePatient, strokePatientId } from './stroke.ts';

export type Seed = {
  institution: Institution;
  staff: Staff[];
  patients: Patient[];
  records: MedicalRecord[];
  plans: SessionPlan[];
  sessions: Session[];
  metricValues: MetricValue[];
  suggestions: Suggestion[];
};

export const demoSessionCodes: ReadonlyMap<string, string> = new Map([
  ['111111', parkinsonsPatientId],
  ['222222', strokePatientId],
  ['333333', aclPatientId],
]);

export const buildSeed = (now: Date): Seed => {
  const parkinsons = buildParkinsonsPatient(now);
  const patientSeeds = [parkinsons, buildStrokePatient(now), buildAclPatient(now)];
  return {
    institution,
    staff: [admin, attending, therapist],
    patients: patientSeeds.map((seed) => seed.patient),
    records: patientSeeds.map((seed) => seed.record),
    plans: patientSeeds.map((seed) => seed.plan),
    sessions: patientSeeds.flatMap((seed) => seed.sessions),
    metricValues: patientSeeds.flatMap((seed) => seed.metricValues),
    suggestions: [buildParkinsonsSuggestion(now, parkinsons)],
  };
};
