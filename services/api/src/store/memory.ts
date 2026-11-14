import type {
  ActivityResult,
  AssistantTurnRecord,
  AuditEntry,
  Baseline,
  CheckInEntry,
  Episode,
  Flag,
  Institution,
  MedicalRecord,
  MetricPoint,
  PairedDevice,
  Patient,
  Session,
  SessionPlan,
  SessionReport,
  Side,
  Staff,
  Suggestion,
} from '@tempo/shared';
import type { Seed } from '../mock/seed/build.ts';
import { keyOfFlag } from './keys.ts';
import {
  byOccurredAt,
  skipsOfResults,
  storedCheckIns,
  storedEpisodes,
  storedResults,
  storedSkips,
  type StoredSkip,
} from './submission.ts';
import { newestFirst, withDecision } from './suggestions.ts';
import type { CodeEntry, MetricValue, PublicDataEntry, ReportLink, Store } from './types.ts';

const seriesKey = (patientId: string, metricId: string, side: Side | undefined): string =>
  `${patientId}|${metricId}|${side ?? 'none'}`;

const flagId = (flag: Flag): string => {
  const { pk, sk } = keyOfFlag(flag);
  return `${pk}|${sk}`;
};

const byTime =<Item extends { t: string }>(a: Item, b: Item): number => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0);

const point = ({ t, value, sessionId }: MetricValue): MetricPoint => ({ t, value, sessionId });

const byAuditTime = (a: AuditEntry, b: AuditEntry): number => {
  const left = `${a.at}#${a.id}`;
  const right = `${b.at}#${b.id}`;
  return left < right ? -1 : left > right ? 1 : 0;
};

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
  const checkIns = new Map<string, CheckInEntry>();
  const episodes = new Map<string, Episode>();
  const reports = new Map<string, SessionReport>();
  const painAlerts = new Set<string>();
  const publicData = new Map<string, PublicDataEntry>();
  const suggestions = new Map<string, Suggestion>();
  const auditEntries: AuditEntry[] = [];
  const assistantTurns = new Map<string, AssistantTurnRecord>();
  const reminders = new Set<string>();
  const reportLinks = new Map<string, ReportLink>();

  const addMetricValues = (values: MetricValue[]): void => {
    for (const value of values) {
      const key = seriesKey(value.patientId, value.metricId, value.side);
      const series = (points.get(key) ?? []).filter((point) => point.t !== value.t);
      points.set(key, [...series, value].sort(byTime));
      const last = latest.get(key);
      if (!last || last.t <= value.t) latest.set(key, value);
    }
  };

  const addSkips = (patientId: string, added: StoredSkip[]): void => {
    for (const skip of added) {
      const key = `${patientId}|${skip.activityId}`;
      const others = (skips.get(key) ?? []).filter((existing) => existing.event.id !== skip.event.id);
      skips.set(key, [...others, skip].sort((a, b) => byTime(a.event, b.event)));
    }
  };

  const addCheckIns = (entries: CheckInEntry[]): void => {
    for (const entry of entries) checkIns.set(`${entry.patientId}|${entry.id}`, entry);
  };

  const addEpisode = (episode: Episode): Episode => {
    const key = `${episode.patientId}|${episode.id}`;
    const existing = episodes.get(key);
    if (existing) return existing;
    episodes.set(key, episode);
    return episode;
  };

  const addFlags = (added: Flag[]): void => {
    for (const flag of added) flags.set(flagId(flag), flag);
  };

  if (seed) {
    institutions.set(seed.institution.id, seed.institution);
    for (const member of seed.staff) staff.set(member.id, member);
    for (const patient of seed.patients) patients.set(patient.id, patient);
    for (const record of seed.records) records.set(record.patientId, record);
    for (const plan of seed.plans) plans.set(plan.patientId, plan);
    for (const session of seed.sessions) sessions.set(session.id, session);
    addMetricValues(seed.metricValues);
    for (const suggestion of seed.suggestions) suggestions.set(`${suggestion.patientId}|${suggestion.id}`, suggestion);
    for (const result of seed.results) results.set(result.sessionId, [...(results.get(result.sessionId) ?? []), result]);
    for (const result of seed.results) addSkips(result.patientId, skipsOfResults([result]));
    addCheckIns(seed.checkIns);
    for (const episode of seed.episodes) addEpisode(episode);
    addFlags(seed.flags);
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
      addSkips(session.patientId, storedSkips(session, submitted));
      addCheckIns(storedCheckIns(session, submitted));
      for (const episode of storedEpisodes(session, submitted)) addEpisode(episode);
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
        .filter((value) => value.t >= from && value.t <= to)
        .map(point),

    firstPoints: async (patientId, metricId, side, count) =>
      (points.get(seriesKey(patientId, metricId, side)) ?? []).slice(0, count).map(point),

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
      const earlier = (points.get(seriesKey(patientId, metricId, side)) ?? []).filter((value) => value.t < before);
      const last = earlier.at(-1);
      return last && point(last);
    },

    putFlags: async (newFlags) => {
      addFlags(newFlags);
    },

    listFlags: async (patientId, sessionId) =>
      [...flags.values()].filter((flag) => flag.patientId === patientId && flag.sessionId === sessionId),

    listPatientFlags: async (patientId) =>
      [...flags.values()].filter((flag) => flag.patientId === patientId).sort(newestFirst),

    listCheckIns: async (patientId, { from, to }) =>
      [...checkIns.values()]
        .filter((entry) => entry.patientId === patientId && entry.recordedAt >= from && entry.recordedAt <= to)
        .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : a.id < b.id ? -1 : 1)),

    putCheckIns: async (entries) => {
      addCheckIns(entries);
    },

    putSkipEvents: async (patientId, added) => {
      addSkips(patientId, added);
    },

    createEpisode: async (episode) => addEpisode(episode),

    listEpisodes: async (patientId, { from, to }) =>
      [...episodes.values()]
        .filter((episode) => episode.patientId === patientId && episode.occurredAt >= from && episode.occurredAt <= to)
        .sort(byOccurredAt),

    putReport: async (report) => {
      reports.set(report.sessionId, report);
    },

    getReport: async (sessionId) => reports.get(sessionId),

    getPublicData: async (kind, query) => publicData.get(`${kind}|${query}`),

    putPublicData: async (entry) => {
      publicData.set(`${entry.kind}|${entry.query}`, entry);
    },

    createSuggestion: async (suggestion) => {
      const key = `${suggestion.patientId}|${suggestion.id}`;
      if (suggestions.has(key)) return false;
      suggestions.set(key, suggestion);
      return true;
    },

    getSuggestion: async (patientId, suggestionId) => suggestions.get(`${patientId}|${suggestionId}`),

    listSuggestions: async (patientId) =>
      [...suggestions.values()]
        .filter((suggestion) => suggestion.patientId === patientId)
        .sort(newestFirst),

    decideSuggestion: async (patientId, suggestionId, decision) => {
      const key = `${patientId}|${suggestionId}`;
      const current = suggestions.get(key);
      if (!current) return undefined;
      const decided = withDecision(current, decision);
      suggestions.set(key, decided);
      return decided;
    },

    putAuditEntry: async (entry) => {
      auditEntries.push(entry);
    },

    listAuditEntries: async (institutionId) =>
      auditEntries.filter((entry) => entry.institutionId === institutionId).sort(byAuditTime),

    putAssistantTurn: async (turn) => {
      assistantTurns.set(turn.id, turn);
    },

    getAssistantTurn: async (turnId) => assistantTurns.get(turnId),

    listInstitutions: async () => [...institutions.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),

    claimReminder: async (patientId, kind, occurrence) => {
      const key = `${patientId}|${kind}|${occurrence}`;
      if (reminders.has(key)) return false;
      reminders.add(key);
      return true;
    },

    releaseReminder: async (patientId, kind, occurrence) => {
      reminders.delete(`${patientId}|${kind}|${occurrence}`);
    },

    putReportLink: async (link) => {
      reportLinks.set(link.token, link);
    },

    getReportLink: async (token, now) => {
      const link = reportLinks.get(token);
      return link && link.expiresAt > now.toISOString() ? link : undefined;
    },
  };
};
