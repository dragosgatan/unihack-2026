import { describe, expect, it } from 'vitest';
import {
  institutionSchema,
  medicalRecordSchema,
  metricIdSchema,
  patientSchema,
  sessionPlanSchema,
  sessionSchema,
  staffSchema,
  suggestionSchema,
  type MetricId,
  type Side,
} from '@tempo/shared';
import { fallbackLabel } from '../../public-data/fallback.ts';
import { fixedNow } from '../testing.ts';
import { aclPatientId } from './acl.ts';
import { buildSeed } from './build.ts';
import { parkinsonsPatientId, parkinsonsSuggestionTerms } from './parkinsons.ts';
import { strokePatientId } from './stroke.ts';

const seed = buildSeed(fixedNow);
const dayMs = 86_400_000;

const valuesOf = (patientId: string, metricId: MetricId, side?: Side): number[] =>
  seed.metricValues
    .filter((value) => value.patientId === patientId && value.metricId === metricId && value.side === side)
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
    .map((value) => value.value);

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

describe('buildSeed', () => {
  it('parses every entity with its shared schema', () => {
    expect(institutionSchema.safeParse(seed.institution).success).toBe(true);
    for (const staff of seed.staff) expect(staffSchema.safeParse(staff).error).toBeUndefined();
    for (const patient of seed.patients) expect(patientSchema.safeParse(patient).error).toBeUndefined();
    for (const record of seed.records) expect(medicalRecordSchema.safeParse(record).error).toBeUndefined();
    for (const plan of seed.plans) expect(sessionPlanSchema.safeParse(plan).error).toBeUndefined();
    for (const session of seed.sessions) expect(sessionSchema.safeParse(session).error).toBeUndefined();
    for (const value of seed.metricValues) expect(metricIdSchema.safeParse(value.metricId).success).toBe(true);
  });

  it('has one institution, three staff with the three roles and three patients', () => {
    expect(seed.institution.name).toBe('Riverside Rehabilitation Centre');
    expect(seed.staff.map((staff) => staff.role).sort()).toEqual(['admin', 'attending', 'therapist']);
    expect(seed.patients).toHaveLength(3);
    expect(seed.records).toHaveLength(3);
    expect(seed.plans).toHaveLength(3);
  });

  it('uses synthetic example.test emails', () => {
    for (const staff of seed.staff) expect(staff.email.endsWith('@example.test')).toBe(true);
  });

  it('gives every patient at least 20 processed sessions over at least 80 days, ending in the past', () => {
    for (const patient of seed.patients) {
      const times = seed.sessions
        .filter((session) => session.patientId === patient.id && session.status === 'processed')
        .map((session) => Date.parse(session.startedAt ?? session.createdAt))
        .sort((a, b) => a - b);
      expect(times.length).toBeGreaterThanOrEqual(20);
      const first = times[0] ?? 0;
      const last = times[times.length - 1] ?? 0;
      expect(last - first).toBeGreaterThanOrEqual(80 * dayMs);
      expect(last).toBeLessThan(fixedNow.getTime());
      expect(fixedNow.getTime() - last).toBeLessThan(5 * dayMs);
    }
  });

  it('includes missed sessions so the schedule is not perfectly regular', () => {
    for (const patient of seed.patients) {
      const times = seed.sessions
        .filter((session) => session.patientId === patient.id)
        .map((session) => Date.parse(session.createdAt))
        .sort((a, b) => a - b);
      const gaps = times.slice(1).map((t, index) => t - (times[index] ?? t));
      expect(Math.max(...gaps)).toBeGreaterThanOrEqual(6 * dayMs);
    }
  });

  it('is deterministic for the same now', () => {
    expect(buildSeed(fixedNow)).toEqual(seed);
  });

  it('keeps values within sensible bounds', () => {
    for (const { metricId, value } of seed.metricValues) {
      expect(value).toBeGreaterThanOrEqual(0);
      if (metricId === 'pain.intensity') expect(value).toBeLessThanOrEqual(10);
      if (metricId === 'medication.adherence') expect(value).toBeLessThanOrEqual(100);
      if (metricId.endsWith('.errors') || metricId.endsWith('.count') || metricId === 'pain.intensity') {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('tells the Parkinson story: right tapping improves after the levodopa change', () => {
    const right = valuesOf(parkinsonsPatientId, 'finger-tapping.taps-per-second', 'right');
    const left = valuesOf(parkinsonsPatientId, 'finger-tapping.taps-per-second', 'left');
    expect(mean(right.slice(-4))).toBeGreaterThan(mean(right.slice(8, 12)));
    expect(mean(right)).toBeLessThan(mean(left));
    expect(valuesOf(parkinsonsPatientId, 'episodes.count').filter((count) => count > 0)).toEqual([1]);
  });

  it('tells the stroke story: the right shoulder recovers towards 115°', () => {
    const right = valuesOf(strokePatientId, 'shoulder-raise.peak-angle', 'right');
    expect(mean(right.slice(0, 3))).toBeLessThan(80);
    expect(mean(right.slice(-3))).toBeGreaterThan(105);
  });

  it('tells the ACL story: symmetry rises from about 62% to about 91%', () => {
    const symmetry = valuesOf(aclPatientId, 'single-leg-squat.symmetry');
    expect(mean(symmetry.slice(0, 3))).toBeLessThan(68);
    expect(mean(symmetry.slice(-3))).toBeGreaterThan(86);
  });

  it('gives the Parkinson patient one proposed suggestion whose evidence is in the seed and the bundled label', () => {
    expect(seed.suggestions).toHaveLength(1);
    const [suggestion] = seed.suggestions;
    expect(suggestionSchema.safeParse(suggestion).error).toBeUndefined();
    expect(suggestion).toMatchObject({ patientId: parkinsonsPatientId, kind: 'review', status: 'proposed' });
    const [metric, medication, label] = suggestion?.evidence ?? [];
    const session = seed.sessions.find((candidate) => candidate.id === metric?.sessionId);
    expect(session?.patientId).toBe(parkinsonsPatientId);
    expect(seed.metricValues).toContainEqual(
      expect.objectContaining({ sessionId: session?.id, metricId: 'trail-making-a.time', t: metric?.t }),
    );
    const record = seed.records.find((candidate) => candidate.patientId === parkinsonsPatientId);
    expect(record?.timeline.some((event) => event.type === 'medication-change' && event.t.slice(0, 10) === medication?.t?.slice(0, 10))).toBe(true);
    const bundled = fallbackLabel({ name: 'Levodopa/Carbidopa', rxnormId: '197444' });
    expect(label?.sourceUrl).toBe(bundled?.sourceUrl);
    for (const term of parkinsonsSuggestionTerms) expect(bundled?.adverseReactions.toLowerCase()).toContain(term);
  });
});
