import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@tempo/shared';
import { app } from './app.ts';

describe('GET /api/health', () => {
  it('returns a body matching the shared schema', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.safeParse(await res.json()).success).toBe(true);
  });
});
