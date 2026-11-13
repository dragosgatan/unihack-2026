import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorSchema, routes } from '@tempo/shared';
import { createApp } from './create-app.ts';
import { mountRoute } from './http.ts';
import { buildSeed } from './mock/seed/build.ts';
import { attending } from './mock/seed/institution.ts';
import { fixedNow } from './mock/testing.ts';
import { createMemoryStore } from './store/memory.ts';

const internalBody = { error: { code: 'internal', message: 'Something went wrong' } };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mountRoute', () => {
  it('turns a body that breaks the response schema into a 500 that names nothing', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = new Hono();
    mountRoute(app, routes.me, () => ({}), () => ({ ...attending, email: 'not-an-email' }));
    const res = await app.request('/api/me');
    expect(res.status).toBe(500);
    const body: unknown = await res.json();
    expect(apiErrorSchema.parse(body)).toEqual(internalBody);
    expect(JSON.stringify(logged.mock.calls)).toContain('GET /api/me');
    expect(JSON.stringify(logged.mock.calls)).toContain('email');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('not-an-email');
  });
});

describe('createApp', () => {
  it('keeps the text of an unexpected error out of the 500 body and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('ResourceNotFoundException: table tempo-prod-main');
    const app = createApp({
      store: createMemoryStore(buildSeed(fixedNow)),
      staffAuth: async () => {
        throw failure;
      },
      tokenSecret: async () => 'secret',
      clock: () => fixedNow,
      startPipeline: async () => {},
    });
    const res = await app.request('/api/me');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('ResourceNotFoundException');
    expect(text).not.toContain('tempo-prod-main');
    expect(apiErrorSchema.parse(JSON.parse(text))).toEqual(internalBody);
    expect(logged).toHaveBeenCalledWith(failure);
  });
});
