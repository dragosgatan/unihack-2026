import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type HomeData, type SubmittedResult } from '@tempo/shared';
import type { OutboxEntry } from '../session/store.ts';
import { fetchHomeData, Unpaired } from './api.ts';
import { loadHomeData } from './data.ts';

const outbox = vi.hoisted((): { entries: OutboxEntry[] } => ({ entries: [] }));
vi.mock('../session/store.ts', () => ({ loadOutbox: async () => outbox.entries }));

const server: HomeData = {
  lastSessionAt: '2026-10-01T10:00:00.000Z',
  checkIns: ['2026-11-13T08:00:00.000Z', '2026-11-13T08:00:00.000Z', '2026-11-13T08:00:00.000Z'],
  pain: [{ t: '2026-11-13T08:00:00.000Z', intensity: 3 }],
  exercises: [],
};

const unsentAt = '2026-11-14T09:00:00.000Z';
const unsent: SubmittedResult[] = [
  { status: 'completed', raw: { activityId: 'check-in-pain', data: { item: 'pain', intensity: 5 } }, completedAt: '2026-11-14T08:58:00.000Z' },
  { status: 'completed', raw: { activityId: 'sit-to-stand', data: { durationMs: 30_000, reps: [{ startMs: 0, endMs: 900 }] } }, completedAt: unsentAt },
];

const answer = (response: Response) => vi.stubGlobal('fetch', vi.fn(async () => response));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  outbox.entries = [];
});

describe('fetchHomeData', () => {
  it('adds what this phone still has in its outbox to the server answer, and not other tokens', async () => {
    outbox.entries = [
      { sessionId: 'ses-1', token: 'device-token', body: { partial: false, results: unsent } },
      { sessionId: 'ses-2', token: 'other-token', body: { partial: false, results: unsent } },
    ];
    answer(new Response(JSON.stringify(server)));

    const data = await fetchHomeData('device-token');
    expect(fetch).toHaveBeenCalledWith(routes.getDeviceHome.path, { headers: { authorization: 'Bearer device-token' } });
    expect(data.lastSessionAt).toBe(unsentAt);
    expect(data.checkIns).toEqual([unsentAt, ...server.checkIns]);
    expect(data.pain).toEqual([{ t: unsentAt, intensity: 5 }, ...server.pain]);
    expect(data.exercises).toEqual([{ t: unsentAt, activityId: 'sit-to-stand', repetitions: 1 }]);
    expect(loadHomeData()).toEqual(data);
  });

  it('falls back to what the phone saved when offline, and reports a rejected token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await fetchHomeData('device-token')).toEqual({ checkIns: [], pain: [], exercises: [] });

    answer(new Response('{}', { status: 403 }));
    await expect(fetchHomeData('session-token')).rejects.toBeInstanceOf(Unpaired);
  });
});
