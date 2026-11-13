import { describe, expect, it } from 'vitest';
import { apiErrorSchema, routes } from '@tempo/shared';
import { createMockApp } from './app.ts';
import { buildSeed } from './seed/build.ts';
import { buildTestApp, call, fingerTappingSubmission, fixedNow } from './testing.ts';

const expectError = (result: { status: number; body: unknown }, status: number, code: string) => {
  expect(result.status).toBe(status);
  expect(apiErrorSchema.parse(result.body).error.code).toBe(code);
};

const createSession = async (app: ReturnType<typeof buildTestApp>, patientId: string) => {
  const result = await call(app, `/api/patients/${patientId}/sessions`, {
    method: 'POST',
    token: 'mock-therapist',
    body: { mode: 'kiosk' },
  });
  expect(result.status).toBe(200);
  return routes.createSession.response.parse(result.body);
};

const redeem = async (app: ReturnType<typeof buildTestApp>, code: string) => {
  const result = await call(app, '/api/device/session-code', { method: 'POST', body: { code } });
  expect(result.status).toBe(200);
  return routes.redeemSessionCode.response.parse(result.body);
};

describe('mock session flow', () => {
  it('creates, redeems and submits a session', async () => {
    const app = buildTestApp();
    const created = await createSession(app, 'pat-2');
    expect(created.session).toMatchObject({
      status: 'created',
      partial: false,
      startedBy: 'staff-ther-1',
      planId: 'plan-2',
      planVersion: 2,
    });
    expect(created.code).toMatch(/^\d{6}$/);
    expect(['111111', '222222', '333333']).not.toContain(created.code);
    expect(Date.parse(created.expiresAt) - fixedNow.getTime()).toBe(10 * 60_000);

    const redeemed = await redeem(app, created.code);
    expect(redeemed.session).toMatchObject({ id: created.session.id, status: 'in-progress' });
    expect(redeemed.session.startedAt).toBe(fixedNow.toISOString());
    expect(redeemed.patientFirstName).toBe('Vasile');
    expect(redeemed.plan.id).toBe('plan-2');

    const submitPath = `/api/sessions/${created.session.id}/submit`;
    const submitted = await call(app, submitPath, { method: 'POST', token: redeemed.token, body: fingerTappingSubmission });
    expect(submitted).toEqual({ status: 200, body: { sessionId: created.session.id, status: 'submitted' } });

    const again = await call(app, submitPath, { method: 'POST', token: redeemed.token, body: fingerTappingSubmission });
    expect(again).toEqual(submitted);
  });

  it('rejects a code that was already used', async () => {
    const app = buildTestApp();
    const { code } = await createSession(app, 'pat-3');
    await redeem(app, code);
    expectError(await call(app, '/api/device/session-code', { method: 'POST', body: { code } }), 400, 'code_invalid');
  });

  it('rejects an unknown code', async () => {
    const app = buildTestApp();
    expectError(
      await call(app, '/api/device/session-code', { method: 'POST', body: { code: '000000' } }),
      400,
      'code_invalid',
    );
  });

  it('rejects an expired code', async () => {
    let now = fixedNow;
    const app = createMockApp({ clock: () => now, seed: buildSeed(fixedNow) });
    const { code } = await createSession(app, 'pat-2');
    now = new Date(fixedNow.getTime() + 11 * 60_000);
    expectError(await call(app, '/api/device/session-code', { method: 'POST', body: { code } }), 400, 'code_invalid');
  });

  it('lets a demo code start a fresh session every time', async () => {
    const app = buildTestApp();
    const first = await redeem(app, '111111');
    const second = await redeem(app, '111111');
    expect(first.session.id).not.toBe(second.session.id);
    expect(first.session.patientId).toBe('pat-1');
    expect(first.patientFirstName).toBe('Elena');
    expect(first.plan.language).toBe('ro');
    expect((await redeem(app, '333333')).session.patientId).toBe('pat-3');
  });

  it('guards submit with the device token of that session', async () => {
    const app = buildTestApp();
    const first = await redeem(app, '222222');
    const second = await redeem(app, '222222');
    const path = `/api/sessions/${first.session.id}/submit`;
    const body = fingerTappingSubmission;

    expectError(await call(app, path, { method: 'POST', body }), 401, 'unauthenticated');
    expectError(await call(app, path, { method: 'POST', token: 'device-unknown', body }), 401, 'unauthenticated');
    expectError(await call(app, path, { method: 'POST', token: second.token, body }), 403, 'forbidden');
    expectError(
      await call(app, '/api/sessions/sess-missing/submit', { method: 'POST', token: first.token, body }),
      404,
      'not_found',
    );
    expectError(
      await call(app, path, { method: 'POST', token: first.token, body: { partial: false, results: [{}] } }),
      400,
      'invalid_request',
    );
  });

  it('refuses to create a session for a patient without a plan', async () => {
    const seed = buildSeed(fixedNow);
    const app = buildTestApp({ ...seed, plans: seed.plans.filter((plan) => plan.patientId !== 'pat-1') });
    expectError(
      await call(app, '/api/patients/pat-1/sessions', { method: 'POST', body: { mode: 'home' } }),
      400,
      'invalid_request',
    );
  });
});
