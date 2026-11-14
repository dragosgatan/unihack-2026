import type {
  ActivityResult,
  Baseline,
  Flag,
  MedicalRecord,
  MetricId,
  MetricPoint,
  Patient,
  Session,
  SessionPlan,
  SessionReport,
  SessionStatus,
  Side,
  Staff,
  Suggestion,
} from '@tempo/shared';
import type { PublicData } from '@tempo/api/public-data';
import type { PipelineAi } from './ai-port.ts';

export type PointWrite = {
  patientId: string;
  sessionId: string;
  metricId: MetricId;
  side?: Side;
  t: string;
  value: number;
};

export type PipelineStore = {
  getSession(sessionId: string): Promise<Session | undefined>;
  listPatientSessions(patientId: string): Promise<Session[]>;
  getPatientDetail(
    patientId: string,
  ): Promise<{ patient: Patient; record: MedicalRecord | undefined; plan: SessionPlan | undefined } | undefined>;
  getStaff(staffId: string): Promise<Staff | undefined>;
  listResults(sessionId: string): Promise<ActivityResult[]>;
  putResults(sessionId: string, results: ActivityResult[]): Promise<void>;
  setSessionStatus(sessionId: string, status: SessionStatus): Promise<void>;
  claimPainAlert(sessionId: string): Promise<boolean>;
  releasePainAlert(sessionId: string): Promise<void>;
  putMetricValues(values: PointWrite[]): Promise<void>;
  firstPoints(patientId: string, metricId: MetricId, side: Side | undefined, count: number): Promise<MetricPoint[]>;
  previousPoint(patientId: string, metricId: MetricId, side: Side | undefined, before: string): Promise<MetricPoint | undefined>;
  baselineAt(patientId: string, metricId: MetricId, side: Side | undefined, at: string): Promise<Baseline | undefined>;
  putFlags(flags: Flag[]): Promise<void>;
  listFlags(patientId: string, sessionId: string): Promise<Flag[]>;
  putReport(report: SessionReport): Promise<void>;
  getReport(sessionId: string): Promise<SessionReport | undefined>;
  getSuggestion(patientId: string, suggestionId: string): Promise<Suggestion | undefined>;
  createSuggestion(suggestion: Suggestion): Promise<boolean>;
};

export type Email = { to: string; subject: string; text: string };

export type SendEmail = (email: Email) => Promise<void>;

export type PipelineDeps = {
  store: PipelineStore;
  ai: PipelineAi;
  publicData: PublicData;
  sendEmail: SendEmail;
  clock: () => Date;
  appUrl: string;
};

export const requireSession = async (store: PipelineStore, sessionId: string): Promise<Session> => {
  const session = await store.getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} does not exist`);
  return session;
};

export const sessionLink = (appUrl: string, sessionId: string): string =>
  `${appUrl.replace(/\/+$/, '')}/clinician/sessions/${encodeURIComponent(sessionId)}`;

export const sideOf =(side: Side | undefined): { side?: Side } => (side ? { side } : {});
