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

  it('scores word recall from the uploaded recording and puts it on the report', async () => {
    const app = buildTestApp();
    const { session, token } = await redeem(app, '111111');
    const recordingId = crypto.randomUUID();
    const upload = await call(app, `/api/sessions/${session.id}/recordings`, {
      method: 'POST',
      token,
      body: { id: recordingId, mimeType: 'audio/webm;codecs=opus', data: Buffer.from('spoken words').toString('base64') },
    });
    expect(upload).toEqual({ status: 200, body: { id: recordingId } });

    const data = {
      part: 'immediate',
      language: 'ro',
      words: ['apple', 'river', 'chair', 'garden', 'candle'],
      presentedAt: '2026-11-13T11:50:00.000Z',
      recording: { id: recordingId, mimeType: 'audio/webm;codecs=opus', durationMs: 8000, bytes: 12 },
    };
    const completedAt = '2026-11-13T11:51:00.000Z';
    const body = { partial: false, results: [{ status: 'completed', completedAt, raw: { activityId: 'word-recall', data } }] };
    await call(app, `/api/sessions/${session.id}/submit`, { method: 'POST', token, body });

    const report = routes.getSessionReport.response.parse((await call(app, `/api/sessions/${session.id}/report`)).body);
    expect(report.scores).toMatchObject([{ activityId: 'word-recall', metricId: 'word-recall.immediate', value: 4, scoredBy: 'ai' }]);
    expect(report.aiItems).toHaveLength(1);
    expect(report.aiItems[0]?.ai.promptVersion).toBe('speech-1');
    const series = routes.getMetricSeries.response.parse(
      (await call(app, '/api/patients/pat-1/metrics/word-recall.immediate?range=W')).body,
    );
    expect(series.points.filter((point) => point.t === completedAt)).toEqual([{ t: completedAt, value: 4, sessionId: session.id }]);
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

  it('runs a home check-in through the pipeline into points, check-ins, episodes and the home screen', async () => {
    const app = buildTestApp();
    const { code } = routes.createPairingCode.response.parse(
      (await call(app, '/api/patients/pat-1/pairing-codes', { method: 'POST' })).body,
    );
    const { token } = routes.redeemPairingCode.response.parse(
      (await call(app, '/api/device/pairing-code', { method: 'POST', body: { code } })).body,
    );
    const { session } = routes.startHomeSession.response.parse(
      (await call(app, '/api/device/sessions', { method: 'POST', token })).body,
    );
    const completedAt = '2026-11-13T11:40:00.000Z';
    const [tapping] = fingerTappingSubmission.results;
    const results = [
      { status: 'completed', completedAt, raw: { activityId: 'check-in-pain', data: { item: 'pain', intensity: 5, location: 'back' } } },
      {
        status: 'completed',
        completedAt,
        raw: {
          activityId: 'check-in-medication',
          data: { item: 'medication', medications: [{ medicationId: 'med-2', name: 'Levodopa/Carbidopa', status: 'taken' }] },
        },
      },
      { status: 'completed', completedAt, raw: { activityId: 'check-in-episodes', data: { item: 'episodes', episodes: [{ type: 'freezing', count: 2 }] } } },
      { ...tapping, completedAt },
    ];
    const submitted = await call(app, `/api/sessions/${session.id}/submit`, { method: 'POST', token, body: { partial: false, results } });
    expect(submitted.body).toEqual({ sessionId: session.id, status: 'submitted' });

    const pointAt = async (metricId: string) =>
      routes.getMetricSeries.response
        .parse((await call(app, `/api/patients/pat-1/metrics/${metricId}?range=W`)).body)
        .points.filter((point) => point.t === completedAt);
    expect(await pointAt('pain.intensity')).toEqual([{ t: completedAt, value: 5, sessionId: session.id }]);
    expect(await pointAt('medication.adherence')).toEqual([{ t: completedAt, value: 100, sessionId: session.id }]);
    expect(await pointAt('episodes.count')).toEqual([{ t: completedAt, value: 2, sessionId: session.id }]);

    const entries = routes.listPatientCheckIns.response.parse((await call(app, '/api/patients/pat-1/check-ins?range=W')).body).entries;
    expect(entries.filter((entry) => entry.sessionId === session.id)).toHaveLength(3);
    const episodes = routes.listPatientEpisodes.response.parse((await call(app, '/api/patients/pat-1/episodes?range=W')).body).episodes;
    expect(episodes[0]).toMatchObject({ type: 'freezing', count: 2, occurredAt: completedAt, source: 'check-in' });

    const home = await call(app, '/api/device/home', { token });
    const data = routes.getDeviceHome.response.parse(home.body);
    expect(data.lastSessionAt).toBe(fixedNow.toISOString());
    expect(data.pain[0]).toEqual({ t: completedAt, intensity: 5 });
    expect(JSON.stringify(home.body)).not.toMatch(/scores|taps|taps-per-second|adherence/);
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
