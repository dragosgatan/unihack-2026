import { describe, expect, it } from 'vitest';
import {
  activityIdSchema,
  activityIds,
  activityKindSchema,
  bodyRegionLabel,
  bodyRegionSchema,
  fingerTappingConfigSchema,
  fingerTappingRawResultSchema,
  rawResultSchema,
} from './activity.ts';
import { fingerTappingRaw, fingerTappingResult } from './test-fixtures.ts';

describe('activityIdSchema', () => {
  it('accepts every listed MVP activity', () => {
    for (const id of activityIds) expect(activityIdSchema.safeParse(id).success).toBe(true);
  });

  it('rejects a stretch activity', () => {
    expect(activityIdSchema.safeParse('stroop').success).toBe(false);
  });
});

describe('body regions', () => {
  it('accepts a region the patient body map offers', () => {
    expect(bodyRegionSchema.safeParse('left-knee').success).toBe(true);
  });

  it('labels a known region and passes an unknown one through', () => {
    expect(bodyRegionLabel('right-shoulder')).toBe('Right shoulder');
    expect(bodyRegionLabel('elbow')).toBe('elbow');
  });
});

describe('activityKindSchema', () => {
  it('accepts an exercise', () => {
    expect(activityKindSchema.safeParse('exercise').success).toBe(true);
  });
});

describe('fingerTappingConfigSchema', () => {
  it('accepts both hands at 15 s each', () => {
    expect(fingerTappingConfigSchema.safeParse({ sides: ['right', 'left'], trialDurationMs: 15000 }).success).toBe(true);
  });
});

describe('fingerTappingRawResultSchema', () => {
  it('accepts per-hand trials with taps', () => {
    expect(fingerTappingRawResultSchema.safeParse(fingerTappingRaw).success).toBe(true);
  });
});

describe('rawResultSchema', () => {
  it('accepts a finger tapping result', () => {
    expect(rawResultSchema.safeParse(fingerTappingResult).success).toBe(true);
  });

  it('rejects finger tapping data under another activity id', () => {
    expect(rawResultSchema.safeParse({ activityId: 'clock-drawing', data: fingerTappingRaw }).success).toBe(false);
  });
});
