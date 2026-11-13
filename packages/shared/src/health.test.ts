import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.ts';

describe('healthResponseSchema', () => {
  it('accepts an ok status with an ISO time', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', time: '2026-11-13T12:00:00.000Z' }).success).toBe(true);
  });

  it('rejects any other status', () => {
    expect(healthResponseSchema.safeParse({ status: 'down', time: '2026-11-13T12:00:00.000Z' }).success).toBe(false);
  });
});
