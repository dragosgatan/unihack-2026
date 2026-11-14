import { describe, expect, it } from 'vitest';
import {
  activityIdSchema,
  activityIds,
  activityKindSchema,
  fingerTappingConfigSchema,
  fingerTappingRawResultSchema,
  medicationCheckInConfigSchema,
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

describe('medicationCheckInConfigSchema', () => {
  it('accepts the prescribed drugs to ask about', () => {
    expect(
      medicationCheckInConfigSchema.safeParse({ medications: [{ medicationId: 'med-2', name: 'Levodopa/Carbidopa' }] })
        .success,
    ).toBe(true);
  });
});

describe('rawResultSchema check-in results', () => {
  const pain = { item: 'pain', intensity: 6, location: 'lower-back', type: 'ache' };
  const medication = {
    item: 'medication',
    medications: [{ medicationId: 'med-2', name: 'Levodopa/Carbidopa', status: 'missed', sideEffects: 'Dizzy' }],
  };
  const episodes = { item: 'episodes', episodes: [{ type: 'fall', count: 2, description: 'In the kitchen' }] };

  it('accepts a pain, a medication and an episodes result', () => {
    expect(rawResultSchema.safeParse({ activityId: 'check-in-pain', data: pain }).success).toBe(true);
    expect(rawResultSchema.safeParse({ activityId: 'check-in-medication', data: medication }).success).toBe(true);
    expect(rawResultSchema.safeParse({ activityId: 'check-in-episodes', data: episodes }).success).toBe(true);
  });

  it('accepts no pain and no episodes', () => {
    expect(rawResultSchema.safeParse({ activityId: 'check-in-pain', data: { item: 'pain', intensity: 0 } }).success).toBe(true);
    expect(rawResultSchema.safeParse({ activityId: 'check-in-episodes', data: { item: 'episodes', episodes: [] } }).success).toBe(
      true,
    );
  });

  it('rejects check-in data under the wrong activity id', () => {
    expect(rawResultSchema.safeParse({ activityId: 'check-in-medication', data: pain }).success).toBe(false);
    expect(rawResultSchema.safeParse({ activityId: 'finger-tapping', data: episodes }).success).toBe(false);
  });

  it('rejects pain outside 0 to 10', () => {
    expect(rawResultSchema.safeParse({ activityId: 'check-in-pain', data: { item: 'pain', intensity: 11 } }).success).toBe(false);
  });
});
