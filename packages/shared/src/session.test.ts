import { describe, expect, it } from 'vitest';
import { activityResultSchema, sessionPlanSchema, sessionSchema } from './session.ts';
import { fingerTappingResult, patient, session, sessionPlan } from './test-fixtures.ts';

describe('sessionPlanSchema', () => {
  it('accepts a plan with check-in, test and exercise items', () => {
    expect(sessionPlanSchema.safeParse(sessionPlan).success).toBe(true);
  });
});

describe('sessionSchema', () => {
  it('accepts a kiosk session', () => {
    expect(sessionSchema.safeParse(session).success).toBe(true);
  });
});

describe('activityResultSchema', () => {
  const result = {
    id: 'res-1',
    sessionId: session.id,
    patientId: patient.id,
    raw: fingerTappingResult,
    completedAt: '2026-11-13T10:05:00.000Z',
  };

  it('accepts an unscored result from the device', () => {
    expect(activityResultSchema.safeParse(result).success).toBe(true);
  });

  it('accepts a result scored by the pipeline', () => {
    const scored = {
      ...result,
      scores: [
        { metricId: 'finger-tapping.taps-per-second', value: 4.4, side: 'right', scoredBy: 'code' },
        { metricId: 'finger-tapping.taps-per-second', value: 3.8, side: 'left', scoredBy: 'code' },
      ],
    };
    expect(activityResultSchema.safeParse(scored).success).toBe(true);
  });
});
