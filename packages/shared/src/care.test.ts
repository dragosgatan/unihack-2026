import { describe, expect, it } from 'vitest';
import { baselineSchema, courseOfCareSchema } from './care.ts';
import { attending, patient } from './test-fixtures.ts';

describe('courseOfCareSchema', () => {
  it('accepts a discharged course with an outcome', () => {
    const course = {
      id: 'care-1',
      patientId: patient.id,
      status: 'discharged',
      startedAt: '2026-08-02',
      endedAt: '2026-11-10',
      reason: 'Outpatient rehabilitation after medication review',
      outcome: 'Goals met, moved to monthly monitoring',
      updatedAt: '2026-11-10T14:00:00.000Z',
      updatedBy: attending.id,
    };
    expect(courseOfCareSchema.safeParse(course).success).toBe(true);
  });
});

describe('baselineSchema', () => {
  it('accepts a baseline reset by a clinician', () => {
    const baseline = {
      id: 'base-2',
      patientId: patient.id,
      metricId: 'finger-tapping.taps-per-second',
      side: 'right',
      value: 4.1,
      from: '2026-10-01T08:00:00.000Z',
      source: 'clinician',
      reason: 'Levodopa dose increased',
      setBy: attending.id,
    };
    expect(baselineSchema.safeParse(baseline).success).toBe(true);
  });
});
