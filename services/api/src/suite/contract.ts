import { beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { metricRangeSchema, routes, type RouteDefinition, type Side } from '@tempo/shared';
import { buildSeed } from '../mock/seed/build.ts';
import { fingerTappingSubmission } from '../mock/testing.ts';
import { call, expectOk, fixedNow, type Harness, type HarnessFactory, type Result } from './harness.ts';

const seedPatientIds = ['pat-1', 'pat-2', 'pat-3'];
const sides: Side[] = ['left', 'right'];

export const contractSuite = (factory: HarnessFactory): void => {
  let h: Harness;
  const covered = new Set<RouteDefinition>();

  beforeAll(async () => {
    h = await factory(buildSeed(fixedNow));
  });

  const expectValid = <Schema extends z.ZodType>(route: RouteDefinition & { response: Schema }, result: Result) => {
    covered.add(route);
    return expectOk(route, result);
  };

  const metricsOf = async (patientId: string) =>
    expectValid(routes.listPatientMetrics, await call(h.app, `/api/patients/${patientId}/metrics`)).metrics;

  describe('API contract', () => {
    it('GET /api/me', async () => {
      expectValid(routes.me, await call(h.app, '/api/me'));
    });

    it('GET /api/patients', async () => {
      expectValid(routes.listPatients, await call(h.app, '/api/patients'));
    });

    it.each(seedPatientIds)('GET /api/patients/%s', async (patientId) => {
      expectValid(routes.getPatient, await call(h.app, `/api/patients/${h.id(patientId)}`));
    });

    it.each(seedPatientIds)('POST /api/patients/%s/sessions, redeem and submit', async (patientId) => {
      const created = await call(h.app, `/api/patients/${h.id(patientId)}/sessions`, {
        method: 'POST',
        body: { mode: 'kiosk' },
      });
      const { code } = expectValid(routes.createSession, created);

      const redeemed = await call(h.app, '/api/device/session-code', { method: 'POST', body: { code } });
      const { token, session } = expectValid(routes.redeemSessionCode, redeemed);

      const submitted = await call(h.app, `/api/sessions/${session.id}/submit`, {
        method: 'POST',
        token,
        body: fingerTappingSubmission,
      });
      expectValid(routes.submitSession, submitted);
    });

    it.each(seedPatientIds)('GET /api/patients/%s/sessions lists sessions newest first', async (patientId) => {
      const { sessions } = expectValid(routes.listPatientSessions, await call(h.app, `/api/patients/${h.id(patientId)}/sessions`));
      expect(sessions.length).toBeGreaterThan(0);
      for (const session of sessions) expect(session.patientId).toBe(h.id(patientId));
      const created = sessions.map((session) => session.createdAt);
      expect(created).toEqual([...created].sort().reverse());
    });

    it.each(seedPatientIds)('GET /api/patients/%s/flags', async (patientId) => {
      expectValid(routes.listPatientFlags, await call(h.app, `/api/patients/${h.id(patientId)}/flags`));
    });

    it.each(seedPatientIds)('pairs a phone for %s, starts a home session and revokes the phone', async (patientId) => {
      const base = `/api/patients/${h.id(patientId)}`;
      const { code } = expectValid(routes.createPairingCode, await call(h.app, `${base}/pairing-codes`, { method: 'POST' }));
      const paired = expectValid(routes.redeemPairingCode,
        await call(h.app, '/api/device/pairing-code', { method: 'POST', body: { code, label: 'Phone' } }),
      );
      expectValid(routes.startHomeSession,
        await call(h.app, '/api/device/sessions', { method: 'POST', token: paired.token }),
      );
      expectValid(routes.listDevices, await call(h.app, `${base}/devices`));
      expectValid(routes.revokeDevice, await call(h.app, `${base}/devices/${paired.deviceId}/revoke`, { method: 'POST' }));
    });

    it.each(seedPatientIds)('GET /api/patients/%s/metrics lists metrics with last values', async (patientId) => {
      const metrics = await metricsOf(h.id(patientId));
      expect(metrics.length).toBeGreaterThan(0);
      for (const metric of metrics) {
        expect(metric.lastValue).toBeTypeOf('number');
        expect(Date.parse(metric.lastT ?? '')).toBeLessThan(fixedNow.getTime());
      }
    });

    it.each(seedPatientIds)('GET /api/patients/%s/metrics/:metricId for every metric, range and side', async (seedId) => {
      const patientId = h.id(seedId);
      for (const metric of await metricsOf(patientId)) {
        for (const range of metricRangeSchema.options) {
          for (const side of metric.lateral ? sides : [undefined]) {
            const query = new URLSearchParams({ range, ...(side ? { side } : {}) });
            const result = await call(h.app, `/api/patients/${patientId}/metrics/${metric.metricId}?${query}`);
            const series = expectValid(routes.getMetricSeries, result);
            const times = series.points.map((point) => Date.parse(point.t));
            for (const point of series.points) expect(point.sessionId).toEqual(expect.any(String));
            expect(times).toEqual([...times].sort((a, b) => a - b));
            expect(series.baseline).not.toBeNull();
            if (range !== 'W') expect(series.points.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it('GET /api/lookup/medications and /api/lookup/diagnoses', async () => {
      const medications = expectValid(routes.lookupMedications, await call(h.app, '/api/lookup/medications?q=levodopa'));
      expect(medications.items).toContainEqual({ name: 'Carbidopa/Levodopa (Oral Pill) 25-100 mg Tab', rxnormId: '197444' });
      const diagnoses = expectValid(routes.lookupDiagnoses, await call(h.app, '/api/lookup/diagnoses?q=I63'));
      expect(diagnoses.items).toContainEqual({ code: 'I63.9', label: 'Cerebral infarction, unspecified' });
    });

    it.each(seedPatientIds)('GET /api/patients/%s/suggestions', async (patientId) => {
      expectValid(routes.listSuggestions, await call(h.app, `/api/patients/${h.id(patientId)}/suggestions`));
    });

    it('POST /api/patients/:patientId/suggestions/:suggestionId/decision', async () => {
      const base = `/api/patients/${h.id('pat-1')}/suggestions`;
      const [proposed] = expectValid(routes.listSuggestions, await call(h.app, base)).suggestions;
      const decided = expectValid(
        routes.decideSuggestion,
        await call(h.app, `${base}/${proposed?.id}/decision`, { method: 'POST', body: { status: 'dismissed' } }),
      );
      expect(decided.suggestion).toMatchObject({ id: proposed?.id, status: 'dismissed', decidedAt: fixedNow.toISOString() });
    });

    it('covers every route in the shared table', () => {
      const names = Object.entries(routes).flatMap(([name, route]) => (covered.has(route) ? [name] : []));
      expect(names.sort()).toEqual(Object.keys(routes).sort());
    });
  });

  describe('metric series', () => {
    const series = async (path: string) => expectOk(routes.getMetricSeries, await call(h.app, path));
    const tapping = () => `/api/patients/${h.id('pat-1')}/metrics/finger-tapping.taps-per-second`;

    it('defaults to six months and the affected side, and band is baseline plus or minus a margin', async () => {
      const byDefault = await series(tapping());
      const right = await series(`${tapping()}?range=6M&side=right`);
      const left = await series(`${tapping()}?side=left`);
      expect(byDefault).toEqual(right);
      expect(left.points).not.toEqual(right.points);
      expect(right.referenceBand).not.toBeNull();
      const band = right.referenceBand ?? { low: 0, high: 0 };
      expect(band.low).toBeLessThan(right.baseline ?? 0);
      expect(band.high).toBeGreaterThan(right.baseline ?? 0);
      expect(right.unit).toBe('taps/s');
    });

    it('computes the baseline from all history, not from the range', async () => {
      const symmetry = `/api/patients/${h.id('pat-3')}/metrics/single-leg-squat.symmetry`;
      const week = await series(`${symmetry}?range=W`);
      const year = await series(`${symmetry}?range=Y`);
      expect(week.baseline).toBe(year.baseline);
      expect(week.points.length).toBeLessThan(year.points.length);
      const firstThree = year.points
        .slice(0, 3)
        .map((point) => point.value)
        .sort((a, b) => a - b);
      expect(year.baseline).toBe(firstThree[1]);
    });

    it('only returns events inside the range, sorted', async () => {
      const sixMonths = await series(`${tapping()}?range=6M`);
      const week = await series(`${tapping()}?range=W`);
      expect(sixMonths.events.map((event) => event.type)).toEqual(['fall', 'medication-change', 'plan-change']);
      expect(week.events).toEqual([]);
    });

    it('ignores side on a non-lateral metric', async () => {
      const pain = `/api/patients/${h.id('pat-3')}/metrics/pain.intensity`;
      const plain = await series(pain);
      const withSide = await series(`${pain}?side=left`);
      expect(withSide).toEqual(plain);
    });

    it('returns an empty series for a metric the patient has no data for', async () => {
      const empty = await series(`/api/patients/${h.id('pat-3')}/metrics/clock-drawing.score`);
      expect(empty).toMatchObject({ points: [], baseline: null, referenceBand: null });
    });
  });
};
