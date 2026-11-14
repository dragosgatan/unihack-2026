import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { medicationCheckInConfigSchema, routes, type SubmittedResult } from '@tempo/shared';
import { buildSeed } from '../mock/seed/build.ts';
import { call, expectError, expectOk, fixedNow, type Harness, type HarnessFactory } from './harness.ts';

const minutesBefore = (minutes: number): string => new Date(fixedNow.getTime() - minutes * 60_000).toISOString();
const dayMs = 86_400_000;

const checkInResults = (completedAt: string): SubmittedResult[] => [
  {
    status: 'completed',
    completedAt,
    raw: { activityId: 'check-in-pain', data: { item: 'pain', intensity: 6, location: 'right-shoulder', type: 'sharp' } },
  },
  {
    status: 'completed',
    completedAt,
    raw: {
      activityId: 'check-in-medication',
      data: { item: 'medication', medications: [{ medicationId: 'med-3', name: 'Clopidogrel', status: 'missed' }] },
    },
  },
  {
    status: 'completed',
    completedAt,
    raw: { activityId: 'check-in-episodes', data: { item: 'episodes', episodes: [{ type: 'dizziness', count: 2 }] } },
  },
];

const testAndExercise = (completedAt: string): SubmittedResult[] => [
  {
    status: 'completed',
    completedAt,
    raw: {
      activityId: 'finger-tapping',
      data: { trials: [{ side: 'right', prosthesis: false, durationMs: 15000, taps: [{ t: 210, target: 'a', x: 1, y: 2 }] }] },
    },
  },
  {
    status: 'completed',
    completedAt,
    raw: {
      activityId: 'shoulder-raise',
      data: {
        trials: [
          { side: 'right', reps: [{ startMs: 0, endMs: 900, angles: [80, 110] }, { startMs: 1000, endMs: 1900, angles: [70, 100] }] },
          { side: 'left', reps: [{ startMs: 0, endMs: 900, angles: [90, 150] }] },
        ],
      },
    },
  },
  { status: 'completed', completedAt, raw: { activityId: 'sit-to-stand', data: { durationMs: 30000, reps: [{ startMs: 0, endMs: 2000 }] } } },
  { status: 'skipped', activityId: 'trail-making-a', reason: 'tired', stage: 'instructions', skippedAt: completedAt },
];

export const checkInsSuite = (factory: HarnessFactory): void => {
  let h: Harness;

  beforeAll(async () => {
    h = await factory(buildSeed(fixedNow));
  });

  const pair = async (patientId: string) => {
    const { code } = expectOk(
      routes.createPairingCode,
      await call(h.app, `/api/patients/${h.id(patientId)}/pairing-codes`, { method: 'POST' }),
    );
    return expectOk(routes.redeemPairingCode, await call(h.app, '/api/device/pairing-code', { method: 'POST', body: { code } }));
  };

  const sessionToken = async (patientId: string) => {
    const { code } = expectOk(
      routes.createSession,
      await call(h.app, `/api/patients/${h.id(patientId)}/sessions`, { method: 'POST', body: { mode: 'kiosk' } }),
    );
    return expectOk(routes.redeemSessionCode, await call(h.app, '/api/device/session-code', { method: 'POST', body: { code } }));
  };

  const submitHome = async (token: string, results: SubmittedResult[]) => {
    const { session } = expectOk(routes.startHomeSession, await call(h.app, '/api/device/sessions', { method: 'POST', token }));
    expectOk(
      routes.submitSession,
      await call(h.app, `/api/sessions/${session.id}/submit`, { method: 'POST', token, body: { partial: false, results } }),
    );
    return session;
  };

  const home = async (token: string) => expectOk(routes.getDeviceHome, await call(h.app, '/api/device/home', { token }));

  const checkIns = async (patientId: string, query = '') =>
    expectOk(routes.listPatientCheckIns, await call(h.app, `/api/patients/${h.id(patientId)}/check-ins${query}`)).entries;

  const episodes = async (patientId: string, query = '') =>
    expectOk(routes.listPatientEpisodes, await call(h.app, `/api/patients/${h.id(patientId)}/episodes${query}`)).episodes;

  const newestFirst = (times: string[]) => expect(times).toEqual([...times].sort().reverse());

  describe('GET /api/device/home', () => {
    it('answers a paired phone with its plan and the last 30 days of its own check-ins, newest first', async () => {
      const { token } = await pair('pat-1');
      const data = await home(token);

      expect(data.plan?.id).toBe(h.id('plan-1'));
      const medication = data.plan?.items.find((item) => item.activityId === 'check-in-medication');
      expect(medicationCheckInConfigSchema.parse(medication?.config)).toEqual({
        medications: [{ medicationId: 'med-2', name: 'Levodopa/Carbidopa' }],
      });

      expect(data.checkIns.length).toBeGreaterThan(0);
      newestFirst(data.checkIns);
      newestFirst(data.pain.map((entry) => entry.t));
      for (const t of [...data.checkIns, ...data.pain.map((entry) => entry.t)]) {
        expect(fixedNow.getTime() - Date.parse(t)).toBeLessThanOrEqual(30 * dayMs);
      }
      const seededPain = h.seed.metricValues.filter(
        (value) => value.patientId === 'pat-1' && value.metricId === 'pain.intensity' && fixedNow.getTime() - Date.parse(value.t) <= 30 * dayMs,
      );
      expect(data.pain.map((entry) => entry.intensity).sort()).toEqual(seededPain.map((value) => value.value).sort());
      expect(data.exercises).toEqual([]);

      const flagged = h.seed.flags.find((flag) => flag.patientId === 'pat-1');
      const flaggedSession = h.seed.sessions.find((session) => session.id === flagged?.sessionId);
      expect(data.lastSessionAt).toBe(flaggedSession?.submittedAt);
    });

    it('adds a submitted session to the lists without passing on any test result or score', async () => {
      const { token } = await pair('pat-2');
      const before = await home(token);
      const completedAt = minutesBefore(20);
      await submitHome(token, [...checkInResults(completedAt), ...testAndExercise(completedAt)]);

      const after = await home(token);
      expect(Object.keys(after).sort()).toEqual(['checkIns', 'exercises', 'lastSessionAt', 'pain', 'plan']);
      expect(after.lastSessionAt).toBe(fixedNow.toISOString());
      expect(after.checkIns.slice(0, 3)).toEqual([completedAt, completedAt, completedAt]);
      expect(after.checkIns).toHaveLength(before.checkIns.length + 3);
      expect(after.pain[0]).toEqual({ t: completedAt, intensity: 6 });
      expect(after.exercises).toEqual([
        { t: completedAt, activityId: 'shoulder-raise', repetitions: 3 },
        { t: completedAt, activityId: 'sit-to-stand', repetitions: 1 },
      ]);
      const text = JSON.stringify(after);
      for (const leaked of ['taps', 'scores', 'skipped', 'tired', 'angles', 'finger-tapping.']) expect(text).not.toContain(leaked);
    });

    it('does not move the last session for a session with check-ins only', async () => {
      const { token } = await pair('pat-3');
      const before = await home(token);
      await submitHome(token, checkInResults(minutesBefore(10)).slice(0, 1));
      const after = await home(token);
      expect(after.lastSessionAt).toBe(before.lastSessionAt);
      expect(after.checkIns[0]).toBe(minutesBefore(10));
    });

    it('needs a paired phone token', async () => {
      expectError(await call(h.app, '/api/device/home'), 401, 'unauthenticated');
      expectError(await call(h.app, '/api/device/home', { token: 'device-unknown' }), 401, 'unauthenticated');
      const { token } = await sessionToken('pat-2');
      expectError(await call(h.app, '/api/device/home', { token }), 403, 'forbidden');
    });
  });

  describe('POST /api/device/episodes', () => {
    const body = () => ({ id: randomUUID(), type: 'freezing', count: 2, occurredAt: minutesBefore(90), description: 'At the doorway' });

    it('stores a home episode once, so a retry answers with the same episode', async () => {
      const { token } = await pair('pat-1');
      const sent = body();
      const post = (payload: unknown) => call(h.app, '/api/device/episodes', { method: 'POST', token, body: payload });

      const first = expectOk(routes.logDeviceEpisode, await post(sent));
      expect(first.episode).toEqual({ ...sent, patientId: h.id('pat-1'), source: 'home' });
      expect(expectOk(routes.logDeviceEpisode, await post(sent))).toEqual(first);
      expect(expectOk(routes.logDeviceEpisode, await post({ ...sent, count: 5 }))).toEqual(first);

      const listed = (await episodes('pat-1')).filter((episode) => episode.id === sent.id);
      expect(listed).toEqual([first.episode]);
    });

    it('lists an episode from a phone whose clock runs a few minutes ahead', async () => {
      const { token } = await pair('pat-1');
      const sent = { ...body(), occurredAt: minutesBefore(-10) };
      expectOk(routes.logDeviceEpisode, await call(h.app, '/api/device/episodes', { method: 'POST', token, body: sent }));
      expect((await episodes('pat-1'))[0]).toMatchObject({ id: sent.id, occurredAt: sent.occurredAt });
    });

    it('keeps the same id from another patient’s phone apart', async () => {
      const own = await pair('pat-1');
      const other = await pair('pat-3');
      const sent = body();
      const post = (token: string, payload: unknown) => call(h.app, '/api/device/episodes', { method: 'POST', token, body: payload });

      const mine = expectOk(routes.logDeviceEpisode, await post(own.token, sent));
      const theirs = expectOk(routes.logDeviceEpisode, await post(other.token, { ...sent, type: 'fall', count: 1 }));
      expect(theirs.episode).toMatchObject({ id: sent.id, patientId: h.id('pat-3'), type: 'fall', count: 1 });
      expect((await episodes('pat-1')).filter((episode) => episode.id === sent.id)).toEqual([mine.episode]);
      expect((await episodes('pat-3')).filter((episode) => episode.id === sent.id)).toEqual([theirs.episode]);
    });

    it('needs a paired phone token and a valid episode', async () => {
      const path = '/api/device/episodes';
      expectError(await call(h.app, path, { method: 'POST', body: body() }), 401, 'unauthenticated');
      const session = await sessionToken('pat-1');
      expectError(await call(h.app, path, { method: 'POST', token: session.token, body: body() }), 403, 'forbidden');
      const { token } = await pair('pat-1');
      expectError(await call(h.app, path, { method: 'POST', token, body: { ...body(), count: 0 } }), 400, 'invalid_request');
      expectError(await call(h.app, path, { method: 'POST', token, body: { ...body(), type: 'headache' } }), 400, 'invalid_request');
      expectError(await call(h.app, path, { method: 'POST', token, body: { ...body(), description: '' } }), 400, 'invalid_request');
    });
  });

  describe('GET /api/patients/:patientId/check-ins', () => {
    it('lists the seeded entries of six months by default, newest first, filtered by item', async () => {
      const entries = await checkIns('pat-1');
      expect(entries.length).toBeGreaterThan(0);
      newestFirst(entries.map((entry) => entry.recordedAt));
      for (const entry of entries) {
        expect(entry.patientId).toBe(h.id('pat-1'));
        expect(fixedNow.getTime() - Date.parse(entry.recordedAt)).toBeLessThanOrEqual(182 * dayMs);
      }
      expect(new Set(entries.map((entry) => entry.body.item))).toEqual(new Set(['pain', 'medication', 'episodes']));

      const medication = await checkIns('pat-1', '?item=medication');
      expect(medication.length).toBeGreaterThan(0);
      expect(medication).toEqual(entries.filter((entry) => entry.body.item === 'medication'));

      const week = await checkIns('pat-1', '?range=W&item=pain');
      expect(week.length).toBeLessThan(entries.filter((entry) => entry.body.item === 'pain').length);
      for (const entry of week) expect(fixedNow.getTime() - Date.parse(entry.recordedAt)).toBeLessThanOrEqual(7 * dayMs);
    });

    it('shows a submitted check-in first', async () => {
      const { token, session } = await sessionToken('pat-2');
      const completedAt = minutesBefore(5);
      await call(h.app, `/api/sessions/${session.id}/submit`, {
        method: 'POST',
        token,
        body: { partial: false, results: checkInResults(completedAt) },
      });
      const [first, second, third] = await checkIns('pat-2', '?range=W');
      expect([first, second, third].map((entry) => entry?.sessionId)).toEqual([session.id, session.id, session.id]);
      expect([first, second, third].map((entry) => entry?.body.item).sort()).toEqual(['episodes', 'medication', 'pain']);
      expect((await checkIns('pat-2', '?item=pain'))[0]?.body).toEqual({
        item: 'pain',
        intensity: 6,
        location: 'right-shoulder',
        type: 'sharp',
      });
    });

    it('checks the caller and the query', async () => {
      const path = `/api/patients/${h.id('pat-1')}/check-ins`;
      expectError(await call(h.app, path, { token: 'mock-nobody' }), 401, 'unauthenticated');
      expectError(await call(h.app, path, { token: 'mock-therapist' }), 404, 'not_found');
      expectError(await call(h.app, path, { token: 'mock-admin' }), 403, 'forbidden');
      expectError(await call(h.app, `${path}?item=mood`), 400, 'invalid_request');
      expectError(await call(h.app, `${path}?range=2Y`), 400, 'invalid_request');
      expectError(await call(h.app, '/api/patients/pat-404/check-ins'), 404, 'not_found');
    });
  });

  describe('GET /api/patients/:patientId/episodes', () => {
    it('lists the seeded home and check-in episodes, newest first, inside the range', async () => {
      const all = await episodes('pat-1');
      newestFirst(all.map((episode) => episode.occurredAt));
      expect(new Set(all.map((episode) => episode.source))).toEqual(new Set(['home', 'check-in']));
      expect(all.filter((episode) => episode.type === 'fall' && episode.source === 'check-in')).toHaveLength(1);
      for (const episode of all) expect(episode.patientId).toBe(h.id('pat-1'));

      const month = await episodes('pat-1', '?range=M');
      expect(month.length).toBeLessThan(all.length);
      for (const episode of month) expect(fixedNow.getTime() - Date.parse(episode.occurredAt)).toBeLessThanOrEqual(30 * dayMs);
    });

    it('turns a submitted episodes check-in into episodes and a phone report into a home episode', async () => {
      const { token, session } = await sessionToken('pat-2');
      const completedAt = minutesBefore(3);
      await call(h.app, `/api/sessions/${session.id}/submit`, {
        method: 'POST',
        token,
        body: { partial: false, results: checkInResults(completedAt) },
      });
      const phone = await pair('pat-2');
      const id = randomUUID();
      const occurredAt = minutesBefore(1);
      await call(h.app, '/api/device/episodes', { method: 'POST', token: phone.token, body: { id, type: 'fall', count: 1, occurredAt } });

      const [latest, previous] = await episodes('pat-2', '?range=W');
      expect(latest).toEqual({ id, patientId: h.id('pat-2'), type: 'fall', count: 1, occurredAt, source: 'home' });
      expect(previous).toEqual({
        id: `${session.id}-r02-e0`,
        patientId: h.id('pat-2'),
        type: 'dizziness',
        count: 2,
        occurredAt: completedAt,
        source: 'check-in',
      });
    });

    it('checks the caller and the query', async () => {
      const path = `/api/patients/${h.id('pat-1')}/episodes`;
      expectError(await call(h.app, path, { token: 'mock-nobody' }), 401, 'unauthenticated');
      expectError(await call(h.app, path, { token: 'mock-therapist' }), 404, 'not_found');
      expectError(await call(h.app, path, { token: 'mock-admin' }), 403, 'forbidden');
      expectError(await call(h.app, `${path}?range=D`), 400, 'invalid_request');
    });
  });

  describe('patient without a plan', () => {
    let bare: Harness;

    beforeAll(async () => {
      const seed = buildSeed(fixedNow);
      bare = await factory({ ...seed, plans: seed.plans.filter((plan) => plan.patientId !== 'pat-3') });
    });

    it('answers the home screen without a plan', async () => {
      const { code } = expectOk(
        routes.createPairingCode,
        await call(bare.app, `/api/patients/${bare.id('pat-3')}/pairing-codes`, { method: 'POST' }),
      );
      const { token } = expectOk(
        routes.redeemPairingCode,
        await call(bare.app, '/api/device/pairing-code', { method: 'POST', body: { code } }),
      );
      const data = expectOk(routes.getDeviceHome, await call(bare.app, '/api/device/home', { token }));
      expect(data.plan).toBeUndefined();
      expect(data.checkIns.length).toBeGreaterThan(0);
    });
  });
};
