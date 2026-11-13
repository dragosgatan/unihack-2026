import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { apiErrorSchema, routes } from '@tempo/shared';
import { mountRoute } from './http.ts';
import { attending } from './seed/institution.ts';

describe('mountRoute', () => {
  it('turns a body that breaks the response schema into a 500', async () => {
    const app = new Hono();
    mountRoute(app, routes.me, () => ({}), () => ({ ...attending, email: 'not-an-email' }));
    const res = await app.request('/api/me');
    expect(res.status).toBe(500);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('internal');
  });
});
