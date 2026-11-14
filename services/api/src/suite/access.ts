import { beforeAll, describe, expect, it } from 'vitest';
import { routes } from '@tempo/shared';
import { buildSeed } from '../mock/seed/build.ts';
import { call, expectError, expectOk, fixedNow, type Harness, type HarnessFactory } from './harness.ts';

export const accessSuite = (factory: HarnessFactory): void => {
  let h: Harness;

  beforeAll(async () => {
    h = await factory(buildSeed(fixedNow));
  });

  const patientIdsFor = async (token?: string) =>
    expectOk(routes.listPatients, await call(h.app, '/api/patients', token === undefined ? {} : { token })).patients.map(
      (patient) => patient.id,
    );

  describe('mock staff auth', () => {
    it('acts as the attending when there is no Authorization header', async () => {
      expect(expectOk(routes.me, await call(h.app, '/api/me')).role).toBe('attending');
    });

    it.each([
      ['mock-admin', 'admin'],
      ['mock-attending', 'attending'],
      ['mock-therapist', 'therapist'],
    ])('selects the staff member for %s', async (token, role) => {
      expect(expectOk(routes.me, await call(h.app, '/api/me', { token })).role).toBe(role);
    });

    it('rejects an unknown or malformed token with 401', async () => {
      expectError(await call(h.app, '/api/me', { token: 'mock-nobody' }), 401, 'unauthenticated');
      expectError(await call(h.app, '/api/lookup/medications?q=levo', { token: 'mock-nobody' }), 401, 'unauthenticated');
      expectError(await call(h.app, '/api/lookup/diagnoses?q=G20', { token: 'mock-nobody' }), 401, 'unauthenticated');
      expectError(await call(h.app, '/api/patients', { authorization: 'mock-attending' }), 401, 'unauthenticated');
    });
  });

  describe('access rules', () => {
    it('shows the attending all three of their patients', async () => {
      expect(await patientIdsFor()).toEqual([h.id('pat-1'), h.id('pat-2'), h.id('pat-3')]);
    });

    it('hides the Parkinson patient from the therapist', async () => {
      const token = 'mock-therapist';
      const parkinson = `/api/patients/${h.id('pat-1')}`;
      expect(await patientIdsFor(token)).toEqual([h.id('pat-2'), h.id('pat-3')]);
      expectError(await call(h.app, parkinson, { token }), 404, 'not_found');
      expectError(await call(h.app, `${parkinson}/metrics`, { token }), 404, 'not_found');
      expectError(await call(h.app, `${parkinson}/metrics/pain.intensity`, { token }), 404, 'not_found');
      expectError(
        await call(h.app, `${parkinson}/sessions`, { method: 'POST', token, body: { mode: 'kiosk' } }),
        404,
        'not_found',
      );
      expectError(await call(h.app, `${parkinson}/pairing-codes`, { method: 'POST', token }), 404, 'not_found');
      expectError(await call(h.app, `${parkinson}/devices`, { token }), 404, 'not_found');
      expectError(await call(h.app, `${parkinson}/devices/dev-1/revoke`, { method: 'POST', token }), 404, 'not_found');
      expectError(await call(h.app, `${parkinson}/suggestions`, { token }), 404, 'not_found');
      expectError(await call(h.app, `${parkinson}/sessions`, { token }), 404, 'not_found');
      expectError(await call(h.app, `${parkinson}/flags`, { token }), 404, 'not_found');
      expect((await call(h.app, `/api/patients/${h.id('pat-2')}`, { token })).status).toBe(200);
    });

    it('gives the admin the whole registry but no clinical detail', async () => {
      const token = 'mock-admin';
      const patient = `/api/patients/${h.id('pat-1')}`;
      expect(await patientIdsFor(token)).toEqual([h.id('pat-1'), h.id('pat-2'), h.id('pat-3')]);
      expectError(await call(h.app, patient, { token }), 403, 'forbidden');
      expectError(await call(h.app, `${patient}/metrics`, { token }), 403, 'forbidden');
      expectError(await call(h.app, `${patient}/metrics/pain.intensity`, { token }), 403, 'forbidden');
      expectError(
        await call(h.app, `${patient}/sessions`, { method: 'POST', token, body: { mode: 'kiosk' } }),
        403,
        'forbidden',
      );
      expectError(await call(h.app, `${patient}/pairing-codes`, { method: 'POST', token }), 403, 'forbidden');
      expectError(await call(h.app, `${patient}/devices`, { token }), 403, 'forbidden');
      expectError(await call(h.app, `${patient}/devices/dev-1/revoke`, { method: 'POST', token }), 403, 'forbidden');
      expectError(await call(h.app, `${patient}/suggestions`, { token }), 403, 'forbidden');
      expectError(await call(h.app, `${patient}/sessions`, { token }), 403, 'forbidden');
      expectError(await call(h.app, `${patient}/flags`, { token }), 403, 'forbidden');
    });

    it('lets every staff role use the lookups, which hold no patient data', async () => {
      for (const token of ['mock-admin', 'mock-attending', 'mock-therapist']) {
        expect((await call(h.app, '/api/lookup/medications?q=levo', { token })).status).toBe(200);
        expect((await call(h.app, '/api/lookup/diagnoses?q=G20', { token })).status).toBe(200);
      }
    });

    it('returns 404 for an unknown patient or device', async () => {
      expectError(await call(h.app, '/api/patients/pat-404'), 404, 'not_found');
      expectError(
        await call(h.app, `/api/patients/${h.id('pat-1')}/devices/dev-404/revoke`, { method: 'POST' }),
        404,
        'not_found',
      );
    });
  });

  describe('request validation', () => {
    it('rejects an invalid body, params or query with 400', async () => {
      const patient = `/api/patients/${h.id('pat-1')}`;
      expectError(
        await call(h.app, `${patient}/sessions`, { method: 'POST', body: { mode: 'clinic' } }),
        400,
        'invalid_request',
      );
      expectError(await call(h.app, `${patient}/sessions`, { method: 'POST', body: '{nope' }), 400, 'invalid_request');
      expectError(await call(h.app, `${patient}/metrics/grip.strength`), 400, 'invalid_request');
      expectError(await call(h.app, `${patient}/metrics/pain.intensity?range=2Y`), 400, 'invalid_request');
      expectError(
        await call(h.app, '/api/device/session-code', { method: 'POST', body: { code: '12ab' } }),
        400,
        'invalid_request',
      );
      expectError(
        await call(h.app, '/api/device/pairing-code', { method: 'POST', body: { code: '123456', label: '' } }),
        400,
        'invalid_request',
      );
    });

    it.each(['medications', 'diagnoses'])('needs a lookup query of 2 to 80 characters for %s', async (kind) => {
      const lookup = (query: string) => call(h.app, `/api/lookup/${kind}${query}`);
      expectError(await lookup(''), 400, 'invalid_request');
      expectError(await lookup('?q=a'), 400, 'invalid_request');
      expectError(await lookup('?q=%20%20a%20%20'), 400, 'invalid_request');
      expectError(await lookup(`?q=${'a'.repeat(81)}`), 400, 'invalid_request');
      expect((await lookup(`?q=${'a'.repeat(80)}`)).status).toBe(200);
      expect((await lookup('?q=%20i6%20')).status).toBe(200);
    });

    it('answers unknown routes with an API error', async () => {
      expectError(await call(h.app, '/api/nothing-here'), 404, 'not_found');
    });

    it('still answers the health check', async () => {
      const res = await h.app.request('/api/health');
      expect(res.status).toBe(200);
    });
  });
};
