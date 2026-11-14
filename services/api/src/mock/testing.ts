import type { Hono } from 'hono';
import type { SubmitSessionRequest } from '@tempo/shared';
import { createMockApp } from './app.ts';
import type { Seed } from './seed/build.ts';

export const fixedNow = new Date('2026-11-13T12:00:00.000Z');

export const buildTestApp = (seed?: Seed): Hono => createMockApp({ clock: () => fixedNow, ...(seed ? { seed } : {}) });

export type CallOptions = {
  method?: 'GET' | 'POST';
  token?: string;
  authorization?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export const call = async (
  app: Hono,
  path: string,
  { method = 'GET', token, authorization, body, headers: extra = {} }: CallOptions = {},
): Promise<{ status: number; body: unknown }> => {
  const headers = new Headers(extra);
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  if (authorization !== undefined) headers.set('authorization', authorization);
  if (body !== undefined) headers.set('content-type', 'application/json');
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
};

export const fingerTappingSubmission: SubmitSessionRequest = {
  partial: false,
  results: [
    {
      status: 'completed',
      completedAt: '2026-11-13T12:05:00.000Z',
      raw: {
        activityId: 'finger-tapping',
        data: {
          trials: [
            {
              side: 'right',
              prosthesis: false,
              durationMs: 15000,
              taps: [
                { t: 210, target: 'a', x: 102, y: 340 },
                { t: 455, target: 'b', x: 288, y: 338 },
                { t: 702, target: 'a', x: 99, y: 344 },
              ],
            },
            {
              side: 'left',
              prosthesis: false,
              durationMs: 15000,
              taps: [{ t: 260, target: 'a', x: 105, y: 342 }],
            },
          ],
        },
      },
    },
  ],
};
