import type {
  ActivityResult,
  Baseline,
  Flag,
  MetricId,
  MetricPoint,
  Patient,
  Session,
  SessionPlan,
  SessionReport,
  SessionStatus,
  Side,
  Staff,
} from '@tempo/shared';
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
  getPatientDetail(patientId: string): Promise<{ patient: Patient; plan: SessionPlan | undefined } | undefined>;
  getStaff(staffId: string): Promise<Staff | undefined>;
  listResults(sessionId: string): Promise<ActivityResult[]>;
  putResults(sessionId: string, results: ActivityResult[]): Promise<void>;
  setSessionStatus(sessionId: string, status: SessionStatus): Promise<void>;
  putMetricValues(values: PointWrite[]): Promise<void>;
  firstPoints(patientId: string, metricId: MetricId, side: Side | undefined, count: number): Promise<MetricPoint[]>;
  previousPoint(patientId: string, metricId: MetricId, side: Side | undefined, before: string): Promise<MetricPoint | undefined>;
  baselineAt(patientId: string, metricId: MetricId, side: Side | undefined, at: string): Promise<Baseline | undefined>;
  putFlags(flags: Flag[]): Promise<void>;
  listFlags(patientId: string, sessionId: string): Promise<Flag[]>;
  putReport(report: SessionReport): Promise<void>;
  getReport(sessionId: string): Promise<SessionReport | undefined>;
};

export type Email = { to: string; subject: string; text: string };

export type SendEmail = (email: Email) => Promise<void>;

export type PipelineDeps = {
  store: PipelineStore;
  ai: PipelineAi;
  sendEmail: SendEmail;
  clock: () => Date;
  appUrl: string;
};

export const requireSession = async (store: PipelineStore, sessionId: string): Promise<Session> => {
  const session = await store.getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} does not exist`);
  return session;
};

export const sideOf = (side: Side | undefined): { side?: Side } => (side ? { side } : {});
