import type {
  ActivityResult,
  Baseline,
  Flag,
  Institution,
  MedicalRecord,
  PairedDevice,
  Patient,
  Session,
  SessionPlan,
  SessionReport,
  Side,
  Staff,
} from '@tempo/shared';
import type { Seed } from '../mock/seed/build.ts';
import { keyOfFlag } from './keys.ts';
import { storedResults, storedSkips, type StoredSkip } from './submission.ts';
import type { CodeEntry, MetricValue, Store } from './types.ts';

const seriesKey = (patientId: string, metricId: string, side: Side | undefined): string =>
  `${patientId}|${metricId}|${side ?? 'none'}`;

const flagId = (flag: Flag): string => {
  const { pk, sk } = keyOfFlag(flag);
  return `${pk}|${sk}`;
};

const byTime =<Item extends { t: string }>(a: Item, b: Item): number => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0);

const isOpen = (session: Session): boolean => session.status === 'created' || session.status === 'in-progress';

const isLive = (entry: CodeEntry, now: Date): boolean => !entry.used && entry.expiresAt > now.toISOString();

export const createMemoryStore = (seed?: Seed): Store => {
  const institutions = new Map<string, Institution>();
  const staff = new Map<string, Staff>();
  const patients = new Map<string, Patient>();
  const records = new Map<string, MedicalRecord>();
  const plans = new Map<string, SessionPlan>();
  const sessions = new Map<string, Session>();
  const results = new Map<string, ActivityResult[]>();
  const codes = new Map<string, CodeEntry>();
  const devices = new Map<string, PairedDevice>();
  const points = new Map<string, MetricValue[]>();
  const latest = new Map<string, MetricValue>();
  const baselines = new Map<string, Baseline[]>();
  const skips = new Map<string, StoredSkip[]>();
  const flags = new Map<string, Flag>();
  const reports = new Map<string, SessionReport>();
  const painAlerts = new Set<string>();

  const addMetricValues = (values: MetricValue[]): void => {
    for (const value of values) {
      const key = seriesKey(value.patientId, value.metricId, value.side);
      const series = (points.get(key) ?? []).filter((point) => point.t !== value.t);
      points.set(key, [...series, value].sort(byTime));
      const last = latest.get(key);
      if (!last || last.t <= value.t) latest.set(key, value);
    }
  };

  if (seed) {
    institutions.set(seed.institution.id, seed.institution);
    for (const member of seed.staff) staff.set(member.id, member);
    for (const patient of seed.patients) patients.set(patient.id, patient);
    for (const record of seed.records) records.set(record.patientId, record);
    for (const plan of seed.plans) plans.set(plan.patientId, plan);
    for (const session of seed.sessions) sessions.set(session.id, session);
    addMetricValues(seed.metricValues);
  }

  return {
    getStaff: async (staffId) => staff.get(staffId),

    listPatients: async (institutionId) =>
      [...patients.values()]
        .filter((patient) => patient.institutionId === institutionId)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),

    getPatientDetail: async (patientId) => {
      const patient = patients.get(patientId);
      return patient && { patient, record: records.get(patientId), plan: plans.get(patientId) };
    },

    getSession: async (sessionId) => sessions.get(sessionId),

    listPatientSessions: async (patientId) =>
      [...sessions.values()]
        .filter((session) => session.patientId === patientId)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)),

    putSession: async (session) => {
      sessions.set(session.id, session);
    },

    submitSession: async (session, { partial, submittedAt, results: submitted }) => {
      const current = sessions.get(session.id);
      if (!current) throw new Error(`Session ${session.id} does not exist`);
      if (!isOpen(current)) return current.status;
      results.set(session.id, storedResults(session, submitted));
      for (const skip of storedSkips(session, submitted)) {
        const key = `${session.patientId}|${skip.activityId}`;
        const others = (skips.get(key) ?? []).filter((existing) => existing.event.id !== skip.event.id);
        skips.set(key, [...others, skip].sort((a, b) => byTime(a.event, b.event)));
      }
      sessions.set(session.id, { ...current, status: 'submitted', partial, submittedAt });
      return 'submitted';
    },

    createCode: async (entry, now) => {
      const existing = codes.get(entry.code);
      if (existing && isLive(existing, now)) return false;
      codes.set(entry.code, entry);
      return true;
    },

    redeemCode: async (code, kind, now) => {
      const entry = codes.get(code);
      if (!entry || entry.kind !== kind || !isLive(entry, now)) return undefined;
      const used = { ...entry, used: true };
      codes.set(code, used);
      return used;
    },

    getDevice: async (patientId, deviceId) => devices.get(`${patientId}|${deviceId}`),

    putDevice: async (device) => {
      devices.set(`${device.patientId}|${device.id}`, device);
    },

    listDevices: async (patientId) =>
      [...devices.values()]
        .filter((device) => device.patientId === patientId)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),

    listLatest: async (patientId) =>
      [...latest.values()]
        .filter((value) => value.patientId === patientId)
        .map(({ metricId, side, t, value }) => ({ metricId, ...(side ? { side } : {}), t, value })),

    listPoints: async (patientId, metricId, side, { from, to }) =>
      (points.get(seriesKey(patientId, metricId, side)) ?? [])
        .filter((point) => point.t >= from && point.t <= to)
        .map(({ t, value }) => ({ t, value })),

    firstPoints: async (patientId, metricId, side, count) =>
      (points.get(seriesKey(patientId, metricId, side)) ?? []).slice(0, count).map(({ t, value }) => ({ t, value })),

    latestBaseline: async (patientId, metricId, side) =>
      (baselines.get(seriesKey(patientId, metricId, side)) ?? []).reduce<Baseline | undefined>(
        (newest, baseline) => (newest === undefined || baseline.from >= newest.from ? baseline : newest),
        undefined,
      ),

    listSkipEvents: async (patientId, activityId, { from, to }) =>
      (skips.get(`${patientId}|${activityId}`) ?? [])
        .map((skip) => skip.event)
        .filter((event) => event.t >= from && event.t <= to),

    putInstitution: async (institution) => {
      institutions.set(institution.id, institution);
    },

    putStaff: async (member) => {
      staff.set(member.id, member);
    },

    putPatient: async (patient) => {
      patients.set(patient.id, patient);
    },

    putRecord: async (record) => {
      records.set(record.patientId, record);
    },

    putPlan: async (plan) => {
      plans.set(plan.patientId, plan);
    },

    putMetricValues: async (values) => {
      addMetricValues(values);
    },

    listResults: async (sessionId) => results.get(sessionId) ?? [],

    putResults: async (sessionId, updated) => {
      const stored = [...(results.get(sessionId) ?? [])];
      updated.forEach((result, index) => {
        stored[index] = result;
      });
      results.set(sessionId, stored);
    },

    setSessionStatus: async (sessionId, status) => {
      const current = sessions.get(sessionId);
      if (!current) throw new Error(`Session ${sessionId} does not exist`);
      sessions.set(sessionId, { ...current, status });
    },

    claimPainAlert: async (sessionId) => {
      if (painAlerts.has(sessionId)) return false;
      painAlerts.add(sessionId);
      return true;
    },

    releasePainAlert: async (sessionId) => {
      painAlerts.delete(sessionId);
    },

    putBaseline: async (baseline) => {
      const key = seriesKey(baseline.patientId, baseline.metricId, baseline.side);
      const others = (baselines.get(key) ?? []).filter((existing) => existing.from !== baseline.from);
      baselines.set(key, [...others, baseline]);
    },

    baselineAt: async (patientId, metricId, side, at) =>
      (baselines.get(seriesKey(patientId, metricId, side)) ?? [])
        .filter((baseline) => baseline.from <= at)
        .reduce<Baseline | undefined>(
          (newest, baseline) => (newest === undefined || baseline.from >= newest.from ? baseline : newest),
          undefined,
        ),

    previousPoint: async (patientId, metricId, side, before) => {
      const earlier = (points.get(seriesKey(patientId, metricId, side)) ?? []).filter((point) => point.t < before);
      const last = earlier.at(-1);
      return last && { t: last.t, value: last.value };
    },

    putFlags: async (newFlags) => {
      for (const flag of newFlags) flags.set(flagId(flag), flag);
    },

    listFlags: async (patientId, sessionId) =>
      [...flags.values()].filter((flag) => flag.patientId === patientId && flag.sessionId === sessionId),

    putReport: async (report) => {
      reports.set(report.sessionId, report);
    },

    getReport: async (sessionId) => reports.get(sessionId),
  };
};
