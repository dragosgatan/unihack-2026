import type {
  ActivityId,
  ActivityResult,
  Baseline,
  Flag,
  Institution,
  MedicalRecord,
  MetricId,
  MetricPoint,
  PairedDevice,
  Patient,
  Session,
  SessionPlan,
  SessionReport,
  SessionStatus,
  SkipEvent,
  Staff,
  SubmittedResult,
  Side,
} from '@tempo/shared';

export type MetricValue = {
  patientId: string;
  sessionId: string;
  metricId: MetricId;
  side?: Side;
  t: string;
  value: number;
};

export type LatestValue = { metricId: MetricId; side?: Side; t: string; value: number };

export type PatientDetail = { patient: Patient; record: MedicalRecord | undefined; plan: SessionPlan | undefined };

type CodeFields = { code: string; expiresAt: string; used: boolean };
export type CodeEntry =
  | (CodeFields & { kind: 'session'; sessionId: string })
  | (CodeFields & { kind: 'pairing'; patientId: string });
export type CodeKind = CodeEntry['kind'];

export type Submission = { partial: boolean; submittedAt: string; results: SubmittedResult[] };

export type TimeRange = { from: string; to: string };

export type Store = {
  getStaff(staffId: string): Promise<Staff | undefined>;
  listPatients(institutionId: string): Promise<Patient[]>;
  getPatientDetail(patientId: string): Promise<PatientDetail | undefined>;
  getSession(sessionId: string): Promise<Session | undefined>;
  listPatientSessions(patientId: string): Promise<Session[]>;
  putSession(session: Session): Promise<void>;
  submitSession(session: Session, submission: Submission): Promise<SessionStatus>;
  createCode(entry: CodeEntry, now: Date): Promise<boolean>;
  redeemCode(code: string, kind: CodeKind, now: Date): Promise<CodeEntry | undefined>;
  getDevice(patientId: string, deviceId: string): Promise<PairedDevice | undefined>;
  putDevice(device: PairedDevice): Promise<void>;
  listDevices(patientId: string): Promise<PairedDevice[]>;
  listLatest(patientId: string): Promise<LatestValue[]>;
  listPoints(patientId: string, metricId: MetricId, side: Side | undefined, range: TimeRange): Promise<MetricPoint[]>;
  firstPoints(patientId: string, metricId: MetricId, side: Side | undefined, count: number): Promise<MetricPoint[]>;
  latestBaseline(patientId: string, metricId: MetricId, side: Side | undefined): Promise<Baseline | undefined>;
  listSkipEvents(patientId: string, activityId: ActivityId, range: TimeRange): Promise<SkipEvent[]>;
  putInstitution(institution: Institution): Promise<void>;
  putStaff(staff: Staff): Promise<void>;
  putPatient(patient: Patient): Promise<void>;
  putRecord(record: MedicalRecord): Promise<void>;
  putPlan(plan: SessionPlan): Promise<void>;
  putMetricValues(values: MetricValue[]): Promise<void>;
  listResults(sessionId: string): Promise<ActivityResult[]>;
  putResults(sessionId: string, results: ActivityResult[]): Promise<void>;
  setSessionStatus(sessionId: string, status: SessionStatus): Promise<void>;
  claimPainAlert(sessionId: string): Promise<boolean>;
  releasePainAlert(sessionId: string): Promise<void>;
  putBaseline(baseline: Baseline): Promise<void>;
  baselineAt(patientId: string, metricId: MetricId, side: Side | undefined, at: string): Promise<Baseline | undefined>;
  previousPoint(patientId: string, metricId: MetricId, side: Side | undefined, before: string): Promise<MetricPoint | undefined>;
  putFlags(flags: Flag[]): Promise<void>;
  listFlags(patientId: string, sessionId: string): Promise<Flag[]>;
  putReport(report: SessionReport): Promise<void>;
  getReport(sessionId: string): Promise<SessionReport | undefined>;
};
