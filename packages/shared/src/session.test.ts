import { describe, expect, it } from 'vitest';
import {
  activityResultSchema,
  sessionPlanSchema,
  sessionSchema,
  skippedResultSchema,
  submittedResultSchema,
} from './session.ts';
import { fingerTappingResult, painSkip, patient, session, sessionPlan } from './test-fixtures.ts';

describe('sessionPlanSchema', () => {
  it('accepts a plan with check-in, test and exercise items', () => {
    expect(sessionPlanSchema.safeParse(sessionPlan).success).toBe(true);
  });
});

describe('sessionSchema', () => {
  it('accepts a kiosk session', () => {
    expect(sessionSchema.safeParse(session).success).toBe(true);
  });

  it('accepts a session completed with skips', () => {
    expect(sessionSchema.safeParse({ ...session, status: 'completed-with-skips' }).success).toBe(true);
  });
});

describe('skippedResultSchema', () => {
  it('accepts a pain skip with a body-map location and partial data', () => {
    expect(skippedResultSchema.safeParse(painSkip).success).toBe(true);
  });

  it('accepts a skip with only reason and stage', () => {
    const bare = { status: 'skipped', activityId: 'clock-drawing', reason: 'not-understood', stage: 'instructions', skippedAt: painSkip.skippedAt };
    expect(skippedResultSchema.safeParse(bare).success).toBe(true);
  });

  it('accepts a spoken note on "something else"', () => {
    const skip = { ...painSkip, reason: 'other', note: 'My glasses are at home' };
    expect(skippedResultSchema.safeParse(skip).success).toBe(true);
  });

  it('rejects an unknown reason or stage', () => {
    expect(skippedResultSchema.safeParse({ ...painSkip, reason: 'bored' }).success).toBe(false);
    expect(skippedResultSchema.safeParse({ ...painSkip, stage: 'results' }).success).toBe(false);
  });
});

describe('submittedResultSchema', () => {
  const completed = { status: 'completed', raw: fingerTappingResult, completedAt: '2026-11-13T10:05:00.000Z' };

  it('accepts a completed and a skipped result', () => {
    expect(submittedResultSchema.safeParse(completed).success).toBe(true);
    expect(submittedResultSchema.safeParse(painSkip).success).toBe(true);
  });

  it('rejects a result without a status', () => {
    const { raw, completedAt } = completed;
    expect(submittedResultSchema.safeParse({ raw, completedAt }).success).toBe(false);
  });
});

describe('activityResultSchema', () => {
  const result = {
    id: 'res-1',
    sessionId: session.id,
    patientId: patient.id,
    status: 'completed',
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

  it('keeps a skipped result unscored', () => {
    const skipped = { id: 'res-2', sessionId: session.id, patientId: patient.id, ...painSkip };
    const scores = [{ metricId: 'shoulder-raise.peak-angle', value: 0, scoredBy: 'code' }];
    expect(activityResultSchema.parse({ ...skipped, scores })).toEqual(skipped);
  });
});
