import {
  institutionSchema,
  medicalRecordSchema,
  patientSchema,
  sessionPlanSchema,
  sessionSchema,
  staffSchema,
  suggestionSchema,
} from '@tempo/shared';
import type { Seed } from '../mock/seed/build.ts';
import type { Store } from './types.ts';

const remap = (value: unknown, ids: ReadonlyMap<string, string>): unknown => {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remap(item, ids));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item, ids)]));
  }
  return value;
};

export const remapSeed = (seed: Seed, ids: ReadonlyMap<string, string>): Seed => ({
  institution: institutionSchema.parse(remap(seed.institution, ids)),
  staff: staffSchema.array().parse(remap(seed.staff, ids)),
  patients: patientSchema.array().parse(remap(seed.patients, ids)),
  records: medicalRecordSchema.array().parse(remap(seed.records, ids)),
  plans: sessionPlanSchema.array().parse(remap(seed.plans, ids)),
  sessions: sessionSchema.array().parse(remap(seed.sessions, ids)),
  metricValues: seed.metricValues.map((value) => ({
    ...value,
    patientId: ids.get(value.patientId) ?? value.patientId,
    sessionId: ids.get(value.sessionId) ?? value.sessionId,
  })),
  suggestions: suggestionSchema.array().parse(remap(seed.suggestions, ids)),
});

export const loadSeed = async (store: Store, seed: Seed, ids: ReadonlyMap<string, string> = new Map()): Promise<Seed> => {
  const remapped = remapSeed(seed, ids);
  await store.putInstitution(remapped.institution);
  for (const staff of remapped.staff) await store.putStaff(staff);
  for (const patient of remapped.patients) await store.putPatient(patient);
  for (const record of remapped.records) await store.putRecord(record);
  for (const plan of remapped.plans) await store.putPlan(plan);
  for (const session of remapped.sessions) await store.putSession(session);
  await store.putMetricValues(remapped.metricValues);
  for (const suggestion of remapped.suggestions) await store.createSuggestion(suggestion);
  return remapped;
};
