import { beforeAll, describe, expect, it } from 'vitest';
import { routes, type SubmitSessionRequest } from '@tempo/shared';
import { buildSeed } from '../mock/seed/build.ts';
import { fingerTappingSubmission } from '../mock/testing.ts';
import { call, expectError, expectOk, fixedNow, type Harness, type HarnessFactory } from './harness.ts';

const skippedAt = new Date(fixedNow.getTime() - 30 * 60_000).toISOString();

const squatSkip: SubmitSessionRequest = {
  partial: true,
  results: [
    {
      status: 'skipped',
      activityId: 'single-leg-squat',
      reason: 'pain',
      stage: 'task',
      skippedAt,
      painLocation: 'right-knee',
    },
  ],
};

export const sessionFlowSuite = (factory: HarnessFactory): void => {
  let h: Harness;

  beforeAll(async () => {
    h = await factory(buildSeed(fixedNow));
  });

  const createSession = async (patientId: string) =>
    expectOk(routes.createSession,
      await call(h.app, `/api/patients/${h.id(patientId)}/sessions`, {
        method: 'POST',
        token: 'mock-therapist',
        body: { mode: 'kiosk' },
      }),
    );

  const redeem = async (code: string) =>
    expectOk(routes.redeemSessionCode, await call(h.app, '/api/device/session-code', { method: 'POST', body: { code } }));

  const startSession = async (patientId: string) => redeem((await createSession(patientId)).code);

  describe('session flow', () => {
    it('creates, redeems and submits a session, and a resubmission changes nothing', async () => {
      const created = await createSession('pat-2');
      expect(created.session).toMatchObject({
        status: 'created',
        partial: false,
        startedBy: h.id('staff-ther-1'),
        planId: h.id('plan-2'),
        planVersion: 2,
      });
      expect(created.code).toMatch(/^\d{6}$/);
      expect(Date.parse(created.expiresAt) - fixedNow.getTime()).toBe(10 * 60_000);

      const redeemed = await redeem(created.code);
      expect(redeemed.session).toMatchObject({ id: created.session.id, status: 'in-progress' });
      expect(redeemed.session.startedAt).toBe(fixedNow.toISOString());
      expect(redeemed.patientFirstName).toBe('Vasile');
      expect(redeemed.plan.id).toBe(h.id('plan-2'));
      expect(Date.parse(redeemed.expiresAt) - fixedNow.getTime()).toBe(2 * 60 * 60_000);

      const submitPath = `/api/sessions/${created.session.id}/submit`;
      const submitted = await call(h.app, submitPath, {
        method: 'POST',
        token: redeemed.token,
        body: fingerTappingSubmission,
      });
      expect(submitted).toEqual({ status: 200, body: { sessionId: created.session.id, status: 'submitted' } });

      const again = await call(h.app, submitPath, { method: 'POST', token: redeemed.token, body: fingerTappingSubmission });
      expect(again).toEqual(submitted);
    });

    it('rejects a code that was already used', async () => {
      const { code } = await createSession('pat-3');
      await redeem(code);
      expectError(await call(h.app, '/api/device/session-code', { method: 'POST', body: { code } }), 400, 'code_invalid');
    });

    it('rejects an unknown code', async () => {
      expectError(
        await call(h.app, '/api/device/session-code', { method: 'POST', body: { code: '000000' } }),
        400,
        'code_invalid',
      );
    });

    it('rejects an expired code', async () => {
      const { code } = await createSession('pat-2');
      h.setNow(new Date(fixedNow.getTime() + 11 * 60_000));
      try {
        expectError(
          await call(h.app, '/api/device/session-code', { method: 'POST', body: { code } }),
          400,
          'code_invalid',
        );
      } finally {
        h.setNow(fixedNow);
      }
    });

    it('refuses a session token once it has expired', async () => {
      const { token, session } = await startSession('pat-2');
      h.setNow(new Date(fixedNow.getTime() + 2 * 60 * 60_000));
      try {
        expectError(
          await call(h.app, `/api/sessions/${session.id}/submit`, { method: 'POST', token, body: fingerTappingSubmission }),
          401,
          'unauthenticated',
        );
      } finally {
        h.setNow(fixedNow);
      }
    });

    it('guards submit with the device token of that session', async () => {
      const first = await startSession('pat-2');
      const second = await startSession('pat-2');
      const path = `/api/sessions/${first.session.id}/submit`;
      const body = fingerTappingSubmission;

      expectError(await call(h.app, path, { method: 'POST', body }), 401, 'unauthenticated');
      expectError(await call(h.app, path, { method: 'POST', token: 'device-unknown', body }), 401, 'unauthenticated');
      expectError(await call(h.app, path, { method: 'POST', token: second.token, body }), 403, 'forbidden');
      expectError(
        await call(h.app, '/api/sessions/sess-missing/submit', { method: 'POST', token: first.token, body }),
        404,
        'not_found',
      );
      expectError(
        await call(h.app, path, { method: 'POST', token: first.token, body: { partial: false, results: [{}] } }),
        400,
        'invalid_request',
      );
    });

    it('does not let a session token start a home session', async () => {
      const { token } = await startSession('pat-3');
      expectError(await call(h.app, '/api/device/sessions', { method: 'POST', token }), 403, 'forbidden');
      expectError(await call(h.app, '/api/device/sessions', { method: 'POST' }), 401, 'unauthenticated');
    });

    it('refuses a session code on the pairing route', async () => {
      const { code } = await createSession('pat-3');
      expectError(await call(h.app, '/api/device/pairing-code', { method: 'POST', body: { code } }), 400, 'code_invalid');
      expect((await redeem(code)).session.patientId).toBe(h.id('pat-3'));
    });
  });

  describe('skipped activities', () => {
    it('show as events on the series of that activity and add no point', async () => {
      const depth = `/api/patients/${h.id('pat-3')}/metrics/single-leg-squat.depth?range=W`;
      const before = expectOk(routes.getMetricSeries, await call(h.app, depth));
      expect(before.events.filter((event) => event.type === 'skip')).toEqual([]);

      const { token, session } = await startSession('pat-3');
      const submitPath = `/api/sessions/${session.id}/submit`;
      expectOk(routes.submitSession, await call(h.app, submitPath, { method: 'POST', token, body: squatSkip }));
      expectOk(routes.submitSession, await call(h.app, submitPath, { method: 'POST', token, body: squatSkip }));

      const after = expectOk(routes.getMetricSeries, await call(h.app, depth));
      expect(after.points).toEqual(before.points);
      expect(after.baseline).toBe(before.baseline);
      const skips = after.events.filter((event) => event.type === 'skip');
      expect(skips).toEqual([
        {
          id: expect.any(String),
          t: skippedAt,
          type: 'skip',
          label: expect.any(String),
          sessionId: session.id,
          reason: 'pain',
          stage: 'task',
        },
      ]);

      const left = expectOk(routes.getMetricSeries, await call(h.app, `${depth}&side=left`));
      expect(left.events.filter((event) => event.type === 'skip')).toHaveLength(1);
      const pain = expectOk(routes.getMetricSeries,
        await call(h.app, `/api/patients/${h.id('pat-3')}/metrics/pain.intensity?range=W`),
      );
      expect(pain.events.filter((event) => event.type === 'skip')).toEqual([]);
    });
  });

  describe('patient without a plan', () => {
    let bare: Harness;

    beforeAll(async () => {
      const seed = buildSeed(fixedNow);
      bare = await factory({
        ...seed,
        plans: seed.plans.filter((plan) => plan.patientId !== 'pat-1'),
        sessions: [],
        metricValues: [],
      });
    });

    it('refuses to create a session', async () => {
      expectError(
        await call(bare.app, `/api/patients/${bare.id('pat-1')}/sessions`, { method: 'POST', body: { mode: 'home' } }),
        400,
        'invalid_request',
      );
    });

    it('pairs a phone in English but refuses a home session', async () => {
      const { code } = expectOk(routes.createPairingCode,
        await call(bare.app, `/api/patients/${bare.id('pat-1')}/pairing-codes`, { method: 'POST' }),
      );
      const paired = expectOk(routes.redeemPairingCode,
        await call(bare.app, '/api/device/pairing-code', { method: 'POST', body: { code } }),
      );
      expect(paired.language).toBe('en');
      expectError(
        await call(bare.app, '/api/device/sessions', { method: 'POST', token: paired.token }),
        400,
        'invalid_request',
      );
    });
  });
};
