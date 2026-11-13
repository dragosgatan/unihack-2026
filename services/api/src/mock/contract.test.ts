import { describe, expect, it } from 'vitest';
import { metricRangeSchema, routes, type RouteName, type Side } from '@tempo/shared';
import { demoSessionCodes } from './seed/build.ts';
import { buildTestApp, call, fingerTappingSubmission, fixedNow } from './testing.ts';

const app = buildTestApp();
const patientIds = [...demoSessionCodes.values()];
const sides: Side[] = ['left', 'right'];
const covered = new Set<RouteName>();

const expectValid = (name: RouteName, result: { status: number; body: unknown }) => {
  expect(result.status).toBe(200);
  expect(routes[name].response.safeParse(result.body).error).toBeUndefined();
  covered.add(name);
};

const metricsOf = async (patientId: string) => {
  const result = await call(app, `/api/patients/${patientId}/metrics`);
  expectValid('listPatientMetrics', result);
  return routes.listPatientMetrics.response.parse(result.body).metrics;
};

describe('mock API contract', () => {
  it('GET /api/me', async () => {
    expectValid('me', await call(app, '/api/me'));
  });

  it('GET /api/patients', async () => {
    expectValid('listPatients', await call(app, '/api/patients'));
  });

  it.each(patientIds)('GET /api/patients/%s', async (patientId) => {
    expectValid('getPatient', await call(app, `/api/patients/${patientId}`));
  });

  it.each(patientIds)('POST /api/patients/%s/sessions, redeem and submit', async (patientId) => {
    const created = await call(app, `/api/patients/${patientId}/sessions`, { method: 'POST', body: { mode: 'kiosk' } });
    expectValid('createSession', created);
    const { code } = routes.createSession.response.parse(created.body);

    const redeemed = await call(app, '/api/device/session-code', { method: 'POST', body: { code } });
    expectValid('redeemSessionCode', redeemed);
    const { token, session } = routes.redeemSessionCode.response.parse(redeemed.body);

    const submitted = await call(app, `/api/sessions/${session.id}/submit`, {
      method: 'POST',
      token,
      body: fingerTappingSubmission,
    });
    expectValid('submitSession', submitted);
  });

  it.each(patientIds)('GET /api/patients/%s/metrics lists metrics with last values', async (patientId) => {
    const metrics = await metricsOf(patientId);
    expect(metrics.length).toBeGreaterThan(0);
    for (const metric of metrics) {
      expect(metric.lastValue).toBeTypeOf('number');
      expect(Date.parse(metric.lastT ?? '')).toBeLessThan(fixedNow.getTime());
    }
  });

  it.each(patientIds)('GET /api/patients/%s/metrics/:metricId for every metric, range and side', async (patientId) => {
    for (const metric of await metricsOf(patientId)) {
      for (const range of metricRangeSchema.options) {
        for (const side of metric.lateral ? sides : [undefined]) {
          const query = new URLSearchParams({ range, ...(side ? { side } : {}) });
          const result = await call(app, `/api/patients/${patientId}/metrics/${metric.metricId}?${query}`);
          expectValid('getMetricSeries', result);
          const series = routes.getMetricSeries.response.parse(result.body);
          const times = series.points.map((point) => Date.parse(point.t));
          expect(times).toEqual([...times].sort((a, b) => a - b));
          expect(series.baseline).not.toBeNull();
          if (range !== 'W') expect(series.points.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('covers every route in the shared table', () => {
    expect([...covered].sort()).toEqual(Object.keys(routes).sort());
  });
});

describe('metric series', () => {
  const series = async (path: string) => {
    const result = await call(app, path);
    expect(result.status).toBe(200);
    return routes.getMetricSeries.response.parse(result.body);
  };

  it('defaults to six months and the affected side, and band is baseline plus or minus a margin', async () => {
    const byDefault = await series('/api/patients/pat-1/metrics/finger-tapping.taps-per-second');
    const right = await series('/api/patients/pat-1/metrics/finger-tapping.taps-per-second?range=6M&side=right');
    const left = await series('/api/patients/pat-1/metrics/finger-tapping.taps-per-second?side=left');
    expect(byDefault).toEqual(right);
    expect(left.points).not.toEqual(right.points);
    expect(right.referenceBand).not.toBeNull();
    const band = right.referenceBand ?? { low: 0, high: 0 };
    expect(band.low).toBeLessThan(right.baseline ?? 0);
    expect(band.high).toBeGreaterThan(right.baseline ?? 0);
    expect(right.unit).toBe('taps/s');
  });

  it('computes the baseline from all history, not from the range', async () => {
    const week = await series('/api/patients/pat-3/metrics/single-leg-squat.symmetry?range=W');
    const year = await series('/api/patients/pat-3/metrics/single-leg-squat.symmetry?range=Y');
    expect(week.baseline).toBe(year.baseline);
    expect(week.points.length).toBeLessThan(year.points.length);
    const firstThree = year.points.slice(0, 3).map((point) => point.value).sort((a, b) => a - b);
    expect(year.baseline).toBe(firstThree[1]);
  });

  it('only returns events inside the range, sorted', async () => {
    const sixMonths = await series('/api/patients/pat-1/metrics/finger-tapping.taps-per-second?range=6M');
    const week = await series('/api/patients/pat-1/metrics/finger-tapping.taps-per-second?range=W');
    expect(sixMonths.events.map((event) => event.type)).toEqual(['fall', 'medication-change', 'plan-change']);
    expect(week.events).toEqual([]);
  });

  it('ignores side on a non-lateral metric', async () => {
    const plain = await series('/api/patients/pat-3/metrics/pain.intensity');
    const withSide = await series('/api/patients/pat-3/metrics/pain.intensity?side=left');
    expect(withSide).toEqual(plain);
  });

  it('returns an empty series for a metric the patient has no data for', async () => {
    const empty = await series('/api/patients/pat-3/metrics/clock-drawing.score');
    expect(empty).toMatchObject({ points: [], baseline: null, referenceBand: null });
  });
});
