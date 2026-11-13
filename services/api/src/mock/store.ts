import type {
  Institution,
  MedicalRecord,
  Patient,
  Session,
  SessionPlan,
  Staff,
  SubmittedResult,
} from '@tempo/shared';
import type { Seed } from './seed/build.ts';
import type { MetricValue } from './seed/history.ts';

export type SessionCode = { sessionId: string; expiresAt: Date; used: boolean };
export type DeviceToken = { sessionId: string; expiresAt: Date };

export type MockStore = {
  institution: Institution;
  staff: Staff[];
  patients: Patient[];
  records: Map<string, MedicalRecord>;
  plans: Map<string, SessionPlan>;
  sessions: Map<string, Session>;
  metricValues: MetricValue[];
  results: Map<string, SubmittedResult[]>;
  codes: Map<string, SessionCode>;
  deviceTokens: Map<string, DeviceToken>;
};

export const createStore = (seed: Seed): MockStore => ({
  institution: seed.institution,
  staff: seed.staff,
  patients: seed.patients,
  records: new Map(seed.records.map((record) => [record.patientId, record])),
  plans: new Map(seed.plans.map((plan) => [plan.patientId, plan])),
  sessions: new Map(seed.sessions.map((session) => [session.id, session])),
  metricValues: seed.metricValues,
  results: new Map(),
  codes: new Map(),
  deviceTokens: new Map(),
});
