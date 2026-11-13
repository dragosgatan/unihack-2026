import { describe, expect, it } from 'vitest';
import { bodyRegionLabel, bodyRegionLabels, bodyRegionSchema, bodyRegions } from './body.ts';

describe('body regions', () => {
  it('has a non-empty label for every region in both languages', () => {
    for (const language of ['en', 'ro'] as const) {
      for (const region of bodyRegions) expect(bodyRegionLabels[language][region].length).toBeGreaterThan(0);
    }
  });

  it('accepts a listed region and rejects anything else', () => {
    expect(bodyRegionSchema.safeParse('left-knee').success).toBe(true);
    expect(bodyRegionSchema.safeParse('left-elbow').success).toBe(false);
  });

  it('labels a stored location and passes an unknown one through', () => {
    expect(bodyRegionLabel('left-knee', 'en')).toBe('Left knee');
    expect(bodyRegionLabel('left-knee', 'ro')).toBe('Genunchiul stâng');
    expect(bodyRegionLabel('somewhere else', 'en')).toBe('somewhere else');
  });
});
