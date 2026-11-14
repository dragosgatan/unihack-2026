import { describe, expect, it, vi } from 'vitest';
import { routes } from '@tempo/shared';
import { createMemoryStore } from '../store/memory.ts';
import { call, expectError } from '../suite/harness.ts';
import { createMockApp } from './app.ts';
import { buildSeed, demoSessionCodes } from './seed/build.ts';
import { buildTestApp, fingerTappingSubmission, fixedNow } from './testing.ts';

const redeem = async (app: ReturnType<typeof buildTestApp>, code: string) => {
  const result = await call(app, '/api/device/session-code', { method: 'POST', body: { code } });
  expect(result.status).toBe(200);
  return routes.redeemSessionCode.response.parse(result.body);
};

describe('mock demo session codes', () => {
  it('lets a demo code start a fresh session every time', async () => {
    const app = buildTestApp();
    const first = await redeem(app, '111111');
    const second = await redeem(app, '111111');
    expect(first.session.id).not.toBe(second.session.id);
    expect(first.session.patientId).toBe('pat-1');
    expect(first.session).toMatchObject({ mode: 'kiosk', status: 'in-progress' });
    expect(first.patientFirstName).toBe('Elena');
    expect(first.plan.language).toBe('ro');
    expect((await redeem(app, '333333')).session.patientId).toBe('pat-3');
  });

  it('gives each demo session its own token', async () => {
    const app = buildTestApp();
    const first = await redeem(app, '222222');
    const second = await redeem(app, '222222');
    const body = fingerTappingSubmission;
    expectError(
      await call(app, `/api/sessions/${first.session.id}/submit`, { method: 'POST', token: second.token, body }),
      403,
      'forbidden',
    );
    const submitted = await call(app, `/api/sessions/${first.session.id}/submit`, {
      method: 'POST',
      token: first.token,
      body,
    });
    expect(submitted.status).toBe(200);
  });

  it('runs the pipeline on submit so the new score shows on the series once', async () => {
    const app = buildTestApp();
    const { session, token } = await redeem(app, '111111');
    const completedAt = '2026-11-13T11:55:00.000Z';
    const [result] = fingerTappingSubmission.results;
    const body = { ...fingerTappingSubmission, results: [{ ...result, completedAt }] };
    const path = `/api/sessions/${session.id}/submit`;

    expect((await call(app, path, { method: 'POST', token, body })).body).toEqual({
      sessionId: session.id,
      status: 'submitted',
    });
    expect((await call(app, path, { method: 'POST', token, body })).body).toEqual({
      sessionId: session.id,
      status: 'processed',
    });

    const series = routes.getMetricSeries.response.parse(
      (await call(app, '/api/patients/pat-1/metrics/finger-tapping.taps-per-second?range=W&side=right')).body,
    );
    expect(series.points.filter((point) => point.t === completedAt)).toEqual([{ t: completedAt, value: 0.2, sessionId: session.id }]);
  });

  it('runs the skip rules on submit: status, skip event without a point, pain flag and one alert', async () => {
    const store = createMemoryStore(buildSeed(fixedNow));
    const app = createMockApp({ clock: () => fixedNow, store });
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { session, token } = await redeem(app, '333333');
    const skippedAt = '2026-11-13T11:50:00.000Z';
    const body = {
      partial: true,
      results: [
        { status: 'skipped', activityId: 'single-leg-squat', reason: 'pain', stage: 'task', skippedAt, painLocation: 'right-knee' },
      ],
    };
    const path = `/api/sessions/${session.id}/submit`;
    const depth = '/api/patients/pat-3/metrics/single-leg-squat.depth?range=W';
    const before = routes.getMetricSeries.response.parse((await call(app, depth)).body);

    await call(app, path, { method: 'POST', token, body });
    expect((await call(app, path, { method: 'POST', token, body })).body).toEqual({
      sessionId: session.id,
      status: 'completed-with-skips',
    });

    const after = routes.getMetricSeries.response.parse((await call(app, depth)).body);
    expect(after.points).toEqual(before.points);
    expect(after.events.filter((event) => event.type === 'skip')).toMatchObject([{ t: skippedAt, sessionId: session.id }]);
    expect(await store.listFlags('pat-3', session.id)).toMatchObject([
      { kind: 'pain-skip', activityId: 'single-leg-squat', stage: 'task', painLocation: 'right-knee' },
    ]);
    const painAlerts = info.mock.calls.filter(([line]) => String(line).includes('stopped because of pain'));
    expect(painAlerts).toHaveLength(1);
    info.mockRestore();
  });

  it('runs the pipeline into a session report whose PDF opens from a link', async () => {
    const app = buildTestApp();
    const { session, token } = await redeem(app, '111111');
    const path = `/api/sessions/${session.id}/submit`;
    await call(app, path, { method: 'POST', token, body: fingerTappingSubmission });

    const report = routes.getSessionReport.response.parse((await call(app, `/api/sessions/${session.id}/report`)).body);
    expect(report.pdfKey).toBe(`reports/pat-1/${session.id}.pdf`);
    const link = routes.createReportLink.response.parse(
      (await call(app, `/api/sessions/${session.id}/report/link`, { method: 'POST' })).body,
    );
    const res = await app.request(link.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('never hands out a demo code for a new session', async () => {
    const app = buildTestApp();
    const created = await call(app, '/api/patients/pat-2/sessions', { method: 'POST', body: { mode: 'kiosk' } });
    const { code } = routes.createSession.response.parse(created.body);
    expect([...demoSessionCodes.keys()]).not.toContain(code);
  });

  it('does not accept a demo code as a pairing code', async () => {
    const app = buildTestApp();
    expectError(
      await call(app, '/api/device/pairing-code', { method: 'POST', body: { code: '111111' } }),
      400,
      'code_invalid',
    );
  });
});
