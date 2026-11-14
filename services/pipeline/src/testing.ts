import { offlinePublicData } from '@tempo/api/public-data';
import { createMemoryStore, type Store } from '@tempo/api/store';
import type {
  ActivityId,
  FingerTappingTrial,
  MetricId,
  Patient,
  Session,
  SessionPlan,
  Side,
  SkipReason,
  Staff,
  SubmittedResult,
} from '@tempo/shared';
import { createAi, createMockProvider } from './ai/index.ts';
import { createPipelineAi } from './ai-port.ts';
import type { Email, PipelineDeps } from './ports.ts';
import { createMemoryRecordingFiles, type MemoryRecordingFiles } from './recording-files.ts';
import { createMemoryReportFiles, type MemoryReportFiles } from './report-files.ts';

export const now = new Date('2026-11-13T12:00:00.000Z');
export const day = (n: number, hour = 10): string => new Date(Date.UTC(2026, 10, n, hour)).toISOString();

export const attending: Staff = {
  id: 'staff-att-1',
  institutionId: 'inst-1',
  role: 'attending',
  name: 'Dr. Mara Velescu',
  email: 'mara.velescu@example.test',
};

export const patient: Patient = {
  id: 'pat-1',
  institutionId: 'inst-1',
  institutionPatientId: 'RRC-00417',
  name: 'Elena Dorian',
  dateOfBirth: '1951-04-22',
  sex: 'female',
  profile: 'neurological',
  attendingId: attending.id,
  therapistIds: [],
  createdAt: '2026-08-02T09:15:00.000Z',
};

const plan: SessionPlan = {
  id: 'plan-1',
  version: 1,
  patientId: patient.id,
  items: [{ activityId: 'finger-tapping', kind: 'test', config: { sides: ['right'], trialDurationMs: 15000 } }],
  schedule: { sessions: 2, per: 'week' },
  language: 'ro',
  createdBy: attending.id,
  updatedAt: '2026-10-01T08:10:00.000Z',
};

export const tappingTrial = (side: Side, taps: number, spacingMs: number): FingerTappingTrial => ({
  side,
  prosthesis: false,
  durationMs: 15000,
  taps: Array.from({ length: taps }, (_, i) => ({ t: i * spacingMs, target: i % 2 === 0 ? 'a' : 'b', x: 0, y: 0 })),
});

export const tappingResult = (completedAt: string, ...trials: FingerTappingTrial[]): SubmittedResult => ({
  status: 'completed',
  completedAt,
  raw: { activityId: 'finger-tapping', data: { trials } },
});

export const rightTapsPerSecond = (completedAt: string, tapsPerSecond: 2 | 4 | 6): SubmittedResult =>
  tappingResult(completedAt, tappingTrial('right', tapsPerSecond * 15, Math.floor(1000 / tapsPerSecond)));

export const painSkip = (skippedAt: string): SubmittedResult => ({
  status: 'skipped',
  activityId: 'shoulder-raise',
  reason: 'pain',
  stage: 'task',
  skippedAt,
  painLocation: 'right-shoulder',
});

export const skip = (activityId: ActivityId, reason: SkipReason, skippedAt: string): SubmittedResult => ({
  status: 'skipped',
  activityId,
  reason,
  stage: 'practice',
  skippedAt,
});

export type Fixture = {
  store: Store;
  deps: PipelineDeps;
  emails: Email[];
  reportFiles: MemoryReportFiles;
  recordings: MemoryRecordingFiles;
};

export const fixture = async (): Promise<Fixture> => {
  const store = createMemoryStore();
  await store.putStaff(attending);
  await store.putPatient(patient);
  await store.putPlan(plan);
  const emails: Email[] = [];
  const clock = () => now;
  const reportFiles = createMemoryReportFiles();
  const recordings = createMemoryRecordingFiles();
  const deps: PipelineDeps = {
    store,
    ai: createPipelineAi(createAi({ provider: createMockProvider(), now: clock }), recordings),
    publicData: offlinePublicData,
    sendEmail: async (email) => {
      emails.push(email);
    },
    clock,
    appUrl: 'https://tempo.example.test/',
    reportFiles,
  };
  return { store, deps, emails, reportFiles, recordings };
};

export const submit = async (
  store: Store,
  sessionId: string,
  results: SubmittedResult[],
  { createdAt = day(1), submittedAt = now.toISOString() }: { createdAt?: string; submittedAt?: string } = {},
): Promise<Session> => {
  const session: Session = {
    id: sessionId,
    patientId: patient.id,
    planId: plan.id,
    planVersion: plan.version,
    mode: 'kiosk',
    status: 'in-progress',
    partial: false,
    createdAt,
  };
  await store.putSession(session);
  await store.submitSession(session, { partial: false, submittedAt, results });
  return session;
};

export const history = async (store: Store, metricId: MetricId, side: Side | undefined, values: number[]) =>
  store.putMetricValues(
    values.map((value, index) => ({
      patientId: patient.id,
      sessionId: `sess-history-${index}`,
      metricId,
      ...(side ? { side } : {}),
      t: day(index + 1),
      value,
    })),
  );

export const allPoints = (store: Store, metricId: MetricId, side: Side | undefined) =>
  store.listPoints(patient.id, metricId, side, { from: '2000-01-01T00:00:00.000Z', to: '2100-01-01T00:00:00.000Z' });
