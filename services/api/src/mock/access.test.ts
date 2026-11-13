import { describe, expect, it } from 'vitest';
import { apiErrorSchema, routes } from '@tempo/shared';
import { buildTestApp, call } from './testing.ts';

const app = buildTestApp();

const patientIdsFor = async (token?: string) => {
  const result = await call(app, '/api/patients', token === undefined ? {} : { token });
  expect(result.status).toBe(200);
  return routes.listPatients.response.parse(result.body).patients.map((patient) => patient.id);
};

const expectError = (result: { status: number; body: unknown }, status: number, code: string) => {
  expect(result.status).toBe(status);
  expect(apiErrorSchema.parse(result.body).error.code).toBe(code);
};

describe('mock staff auth', () => {
  it('acts as the attending when there is no Authorization header', async () => {
    const result = await call(app, '/api/me');
    expect(routes.me.response.parse(result.body).role).toBe('attending');
  });

  it.each([
    ['mock-admin', 'admin'],
    ['mock-attending', 'attending'],
    ['mock-therapist', 'therapist'],
  ])('selects the staff member for %s', async (token, role) => {
    const result = await call(app, '/api/me', { token });
    expect(routes.me.response.parse(result.body).role).toBe(role);
  });

  it('rejects an unknown or malformed token with 401', async () => {
    expectError(await call(app, '/api/me', { token: 'mock-nobody' }), 401, 'unauthenticated');
    expectError(await call(app, '/api/patients', { authorization: 'mock-attending' }), 401, 'unauthenticated');
  });
});

describe('mock access rules', () => {
  it('shows the attending all three of their patients', async () => {
    expect(await patientIdsFor()).toEqual(['pat-1', 'pat-2', 'pat-3']);
  });

  it('hides the Parkinson patient from the therapist', async () => {
    expect(await patientIdsFor('mock-therapist')).toEqual(['pat-2', 'pat-3']);
    expectError(await call(app, '/api/patients/pat-1', { token: 'mock-therapist' }), 404, 'not_found');
    expectError(await call(app, '/api/patients/pat-1/metrics', { token: 'mock-therapist' }), 404, 'not_found');
    expectError(
      await call(app, '/api/patients/pat-1/metrics/pain.intensity', { token: 'mock-therapist' }),
      404,
      'not_found',
    );
    expectError(
      await call(app, '/api/patients/pat-1/sessions', { method: 'POST', token: 'mock-therapist', body: { mode: 'kiosk' } }),
      404,
      'not_found',
    );
    expect((await call(app, '/api/patients/pat-2', { token: 'mock-therapist' })).status).toBe(200);
  });

  it('gives the admin the whole registry but no clinical detail', async () => {
    expect(await patientIdsFor('mock-admin')).toEqual(['pat-1', 'pat-2', 'pat-3']);
    const token = 'mock-admin';
    expectError(await call(app, '/api/patients/pat-1', { token }), 403, 'forbidden');
    expectError(await call(app, '/api/patients/pat-1/metrics', { token }), 403, 'forbidden');
    expectError(await call(app, '/api/patients/pat-1/metrics/pain.intensity', { token }), 403, 'forbidden');
    expectError(
      await call(app, '/api/patients/pat-1/sessions', { method: 'POST', token, body: { mode: 'kiosk' } }),
      403,
      'forbidden',
    );
  });

  it('returns 404 for an unknown patient', async () => {
    expectError(await call(app, '/api/patients/pat-404'), 404, 'not_found');
  });
});

describe('mock request validation', () => {
  it('rejects an invalid body, params or query with 400', async () => {
    expectError(
      await call(app, '/api/patients/pat-1/sessions', { method: 'POST', body: { mode: 'clinic' } }),
      400,
      'invalid_request',
    );
    expectError(await call(app, '/api/patients/pat-1/sessions', { method: 'POST', body: '{nope' }), 400, 'invalid_request');
    expectError(await call(app, '/api/patients/pat-1/metrics/grip.strength'), 400, 'invalid_request');
    expectError(
      await call(app, '/api/patients/pat-1/metrics/pain.intensity?range=2Y'),
      400,
      'invalid_request',
    );
    expectError(await call(app, '/api/device/session-code', { method: 'POST', body: { code: '12ab' } }), 400, 'invalid_request');
  });

  it('answers unknown routes with an API error', async () => {
    expectError(await call(app, '/api/nothing-here'), 404, 'not_found');
  });

  it('still answers the health check', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });
});
