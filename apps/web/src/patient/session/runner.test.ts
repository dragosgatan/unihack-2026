import { describe, expect, it } from 'vitest';
import { skippedResultSchema, skipStageSchema, type DeviceSessionCodeResponse } from '@tempo/shared';
import {
  cannotDo,
  completeActivity,
  completedResult,
  isFinished,
  restoreRunner,
  runnerStateSchema,
  startRunner,
  skipActivity,
  submission,
} from './runner.ts';

const at = '2026-11-13T12:00:00.000Z';

const redeemed: DeviceSessionCodeResponse = {
  token: 'tok',
  expiresAt: at,
  patientFirstName: 'Vasile',
  session: {
    id: 'sess-1',
    patientId: 'pat-1',
    planId: 'plan-1',
    planVersion: 1,
    mode: 'kiosk',
    status: 'in-progress',
    partial: false,
    createdAt: at,
  },
  plan: {
    id: 'plan-1',
    version: 1,
    patientId: 'pat-1',
    items: [
      { activityId: 'finger-tapping', kind: 'test', config: {} },
      { activityId: 'trail-making-a', kind: 'test', config: {} },
    ],
    schedule: { sessions: 2, per: 'week' },
    language: 'en',
    createdBy: 'staff-1',
    updatedAt: at,
  },
};

const tappingData = { trials: [{ side: 'right', prosthesis: false, durationMs: 10000, taps: [] }] };

describe('session runner', () => {
  it('builds a completed result only from valid raw data', () => {
    const result = completedResult('finger-tapping', tappingData, new Date(at));
    expect(result).toEqual({ status: 'completed', raw: { activityId: 'finger-tapping', data: tappingData }, completedAt: at });
    expect(completedResult('finger-tapping', undefined, new Date(at))).toBeUndefined();
    expect(completedResult('trail-making-a', tappingData, new Date(at))).toBeUndefined();
  });

  it('submits a full session as not partial with every saved result in order', () => {
    const result = completedResult('finger-tapping', tappingData, new Date(at));
    const done = completeActivity(completeActivity(startRunner(redeemed), result), undefined);
    expect(isFinished(done)).toBe(true);
    expect(submission(done)).toEqual({ partial: false, results: [result] });
  });

  it('marks a session finished early as partial', () => {
    const early = completeActivity(startRunner(redeemed), undefined);
    expect(early).toMatchObject({ stage: 'between', index: 1 });
    expect(isFinished(early)).toBe(false);
    expect(submission(early)).toEqual({ partial: true, results: [] });
  });

  it('resumes an interrupted activity on the paused screen', () => {
    const running = { ...startRunner(redeemed), stage: 'activity' as const };
    expect(restoreRunner(running).stage).toBe('paused');
    expect(restoreRunner(startRunner(redeemed)).stage).toBe('welcome');
  });

  it('rejects stored state that no longer matches the schema', () => {
    expect(runnerStateSchema.safeParse(startRunner(redeemed)).success).toBe(true);
    expect(runnerStateSchema.safeParse({ ...startRunner(redeemed), stage: 'gone' }).success).toBe(false);
  });

  it.each(skipStageSchema.options)('saves a valid skipped result when stopped at the %s stage', (stage) => {
    const partialData = { taps: [{ t: 120 }] };
    const asked = cannotDo({ ...startRunner(redeemed), stage: 'activity' }, { stage, partialData });
    expect(restoreRunner(asked).stage).toBe('cannot-do');
    const skipped = skipActivity(asked, { reason: 'pain', painLocation: 'right-shoulder' }, new Date(at));
    expect(skipped).toMatchObject({ stage: 'skipped', index: 1 });
    expect(skipped).not.toHaveProperty('pendingSkip');
    const [result] = skipped.results;
    expect(skippedResultSchema.parse(result)).toEqual({
      status: 'skipped',
      activityId: 'finger-tapping',
      reason: 'pain',
      stage,
      painLocation: 'right-shoulder',
      partialData,
      skippedAt: at,
    });
  });

  it('submits a session with skips as finished, keeping completed and skipped results in order', () => {
    const result = completedResult('finger-tapping', tappingData, new Date(at));
    const first = completeActivity(startRunner(redeemed), result);
    const done = skipActivity(cannotDo(first, { stage: 'practice' }), { reason: 'tired' }, new Date(at));
    expect(isFinished(done)).toBe(true);
    expect(submission(done)).toMatchObject({
      partial: false,
      results: [result, { status: 'skipped', activityId: 'trail-making-a', reason: 'tired', stage: 'practice' }],
    });
  });
});
