import { describe, expect, it } from 'vitest';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  languageSchema,
  profileSchema,
  roleSchema,
  sideSchema,
} from './common.ts';

describe('common schemas', () => {
  it('accepts a non-empty id and rejects an empty one', () => {
    expect(idSchema.safeParse('pat-1').success).toBe(true);
    expect(idSchema.safeParse('').success).toBe(false);
  });

  it('accepts ISO dates and datetimes', () => {
    expect(isoDateTimeSchema.safeParse('2026-11-13T10:00:00.000Z').success).toBe(true);
    expect(isoDateSchema.safeParse('1951-04-22').success).toBe(true);
  });

  it('accepts the enum values', () => {
    expect(languageSchema.safeParse('ro').success).toBe(true);
    expect(sideSchema.safeParse('left').success).toBe(true);
    expect(roleSchema.safeParse('therapist').success).toBe(true);
    expect(profileSchema.safeParse('limb-loss').success).toBe(true);
  });
});
