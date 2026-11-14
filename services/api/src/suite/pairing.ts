import { beforeAll, describe, expect, it } from 'vitest';
import { routes } from '@tempo/shared';
import { buildSeed } from '../mock/seed/build.ts';
import { fingerTappingSubmission } from '../mock/testing.ts';
import { call, expectError, expectOk, fixedNow, type Harness, type HarnessFactory } from './harness.ts';

export const pairingSuite = (factory: HarnessFactory): void => {
  let h: Harness;

  beforeAll(async () => {
    h = await factory(buildSeed(fixedNow));
  });

  const pairingCode = async (patientId: string) =>
    expectOk(routes.createPairingCode,
      await call(h.app, `/api/patients/${h.id(patientId)}/pairing-codes`, { method: 'POST', token: 'mock-therapist' }),
    );

  const pair = async (patientId: string, label?: string) => {
    const { code } = await pairingCode(patientId);
    const body = label === undefined ? { code } : { code, label };
    return expectOk(routes.redeemPairingCode, await call(h.app, '/api/device/pairing-code', { method: 'POST', body }));
  };

  const startHome = (token: string) => call(h.app, '/api/device/sessions', { method: 'POST', token });

  describe('device pairing', () => {
    it('pairs once, runs a home session, and stops working after revoke', async () => {
      const { code, expiresAt } = await pairingCode('pat-2');
      expect(code).toMatch(/^\d{6}$/);
      expect(Date.parse(expiresAt) - fixedNow.getTime()).toBe(10 * 60_000);

      const paired = expectOk(routes.redeemPairingCode,
        await call(h.app, '/api/device/pairing-code', { method: 'POST', body: { code, label: "Vasile's phone" } }),
      );
      expect(paired.patientFirstName).toBe('Vasile');
      expect(Date.parse(paired.expiresAt) - fixedNow.getTime()).toBe(180 * 86_400_000);
      expectError(
        await call(h.app, '/api/device/pairing-code', { method: 'POST', body: { code } }),
        400,
        'code_invalid',
      );

      const home = expectOk(routes.startHomeSession, await startHome(paired.token));
      expect(home.session).toMatchObject({
        patientId: h.id('pat-2'),
        planId: h.id('plan-2'),
        mode: 'home',
        status: 'in-progress',
        startedAt: fixedNow.toISOString(),
      });
      expect(home.session.startedBy).toBeUndefined();
      expect(home.plan.id).toBe(h.id('plan-2'));
      expect(home.plan.items.find((item) => item.activityId === 'check-in-medication')?.config).toEqual({
        medications: [
          { medicationId: 'med-3', name: 'Clopidogrel' },
          { medicationId: 'med-4', name: 'Atorvastatin' },
        ],
      });

      const submitPath = `/api/sessions/${home.session.id}/submit`;
      expect(
        expectOk(routes.submitSession, await call(h.app, submitPath, { method: 'POST', token: paired.token, body: fingerTappingSubmission })),
      ).toEqual({ sessionId: home.session.id, status: 'submitted' });

      const devicesPath = `/api/patients/${h.id('pat-2')}/devices`;
      const listed = expectOk(routes.listDevices, await call(h.app, devicesPath, { token: 'mock-therapist' }));
      expect(listed.devices).toContainEqual({
        id: paired.deviceId,
        patientId: h.id('pat-2'),
        label: "Vasile's phone",
        pairedAt: fixedNow.toISOString(),
      });

      const revokePath = `${devicesPath}/${paired.deviceId}/revoke`;
      const revoked = expectOk(routes.revokeDevice, await call(h.app, revokePath, { method: 'POST', token: 'mock-therapist' }));
      expect(revoked.device).toMatchObject({
        id: paired.deviceId,
        revokedAt: fixedNow.toISOString(),
        revokedBy: h.id('staff-ther-1'),
      });
      expect(expectOk(routes.revokeDevice, await call(h.app, revokePath, { method: 'POST' }))).toEqual(revoked);
      const relisted = expectOk(routes.listDevices, await call(h.app, devicesPath));
      expect(relisted.devices.find((device) => device.id === paired.deviceId)).toEqual(revoked.device);

      expectError(await startHome(paired.token), 401, 'unauthenticated');
      expectError(
        await call(h.app, submitPath, { method: 'POST', token: paired.token, body: fingerTappingSubmission }),
        401,
        'unauthenticated',
      );
    });

    it('refuses a pairing code on the session route', async () => {
      const { code } = await pairingCode('pat-3');
      expectError(await call(h.app, '/api/device/session-code', { method: 'POST', body: { code } }), 400, 'code_invalid');
      expect((await call(h.app, '/api/device/pairing-code', { method: 'POST', body: { code } })).status).toBe(200);
    });

    it('lets a patient token submit only sessions of its own patient', async () => {
      const own = await pair('pat-3');
      const other = await pair('pat-2');
      const home = expectOk(routes.startHomeSession, await startHome(own.token));
      expectError(
        await call(h.app, `/api/sessions/${home.session.id}/submit`, {
          method: 'POST',
          token: other.token,
          body: fingerTappingSubmission,
        }),
        403,
        'forbidden',
      );
    });

    it('answers a resend for an already processed session with its status', async () => {
      const paired = await pair('pat-3');
      const processed = h.seed.sessions.find((session) => session.patientId === 'pat-3' && session.status === 'processed');
      const sessionId = h.id(processed?.id ?? '');
      expect(
        expectOk(routes.submitSession,
          await call(h.app, `/api/sessions/${sessionId}/submit`, {
            method: 'POST',
            token: paired.token,
            body: fingerTappingSubmission,
          }),
        ),
      ).toEqual({ sessionId, status: 'processed' });
    });

    it('refuses a forged patient token', async () => {
      const paired = await pair('pat-3');
      const [header, , signature] = paired.token.split('.');
      const claims = { scope: 'patient', pid: h.id('pat-2'), inst: h.id('inst-1'), did: paired.deviceId, exp: 4102444800 };
      const forged = [header, Buffer.from(JSON.stringify(claims)).toString('base64url'), signature].join('.');
      expectError(await startHome(forged), 401, 'unauthenticated');
    });
  });
};
