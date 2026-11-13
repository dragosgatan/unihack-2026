import type {
  ActivityId,
  Baseline,
  Institution,
  MedicalRecord,
  MetricId,
  MetricPoint,
  PairedDevice,
  Patient,
  Session,
  SessionPlan,
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
};
