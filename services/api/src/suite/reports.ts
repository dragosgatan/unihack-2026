import { beforeAll, describe, expect, it } from 'vitest';
import { reportPdfKey } from '@tempo/pipeline';
import { routes, type SessionReport } from '@tempo/shared';
import { buildSeed } from '../mock/seed/build.ts';
import { call, expectError, expectOk, fixedNow, type Harness, type HarnessFactory } from './harness.ts';

const pdfBytes = new TextEncoder().encode('%PDF-1.7\n%suite\n');

export const storeReport = async (h: Harness, seedSessionId: string, { withPdf }: { withPdf: boolean }) => {
  const sessionId = h.id(seedSessionId);
  const session = await h.store.getSession(sessionId);
  if (!session) throw new Error(`Seed session ${seedSessionId} is missing`);
  const pdfKey = reportPdfKey(session.patientId, sessionId);
  const report: SessionReport = {
    sessionId,
    patientId: session.patientId,
    generatedAt: fixedNow.toISOString(),
    skipped: [],
    attention: [],
    scores: [],
    aiItems: [],
    aiSummary: {
      label: 'ai-generated',
      summary: 'No scores were recorded in this session.',
      claims: [],
      ai: {
        model: 'mock',
        promptVersion: 'session-summary@1',
        inputRef: `session:${sessionId}`,
        provider: 'mock',
        createdAt: fixedNow.toISOString(),
      },
    },
    ...(withPdf ? { pdfKey } : {}),
  };
  if (withPdf) await h.reportFiles.put(pdfKey, pdfBytes);
  await h.store.putReport(report);
  return report;
};

export const reportsSuite = (factory: HarnessFactory): void => {
  let h: Harness;
  let withPdf: SessionReport;

  beforeAll(async () => {
    h = await factory(buildSeed(fixedNow));
    withPdf = await storeReport(h, 'pat-1-sess-001', { withPdf: true });
    await storeReport(h, 'pat-1-sess-002', { withPdf: false });
  });

  const reportPath = (seedSessionId: string) => `/api/sessions/${h.id(seedSessionId)}/report`;
  const createLink = async (seedSessionId: string) =>
    expectOk(routes.createReportLink, await call(h.app, `${reportPath(seedSessionId)}/link`, { method: 'POST' }));

  describe('session report', () => {
    it('returns the stored report to the attending', async () => {
      expect(expectOk(routes.getSessionReport, await call(h.app, reportPath('pat-1-sess-001')))).toEqual(withPdf);
    });

    it('returns 404 for a session without a report or an unknown session', async () => {
      expectError(await call(h.app, reportPath('pat-1-sess-003')), 404, 'not_found');
      expectError(await call(h.app, '/api/sessions/sess-404/report'), 404, 'not_found');
      expectError(await call(h.app, `${reportPath('pat-1-sess-003')}/link`, { method: 'POST' }), 404, 'not_found');
      expectError(await call(h.app, '/api/sessions/sess-404/report/link', { method: 'POST' }), 404, 'not_found');
    });

    it('hides the report from staff not assigned to the patient and from the admin', async () => {
      const link = `${reportPath('pat-1-sess-001')}/link`;
      expectError(await call(h.app, reportPath('pat-1-sess-001'), { token: 'mock-therapist' }), 404, 'not_found');
      expectError(await call(h.app, link, { method: 'POST', token: 'mock-therapist' }), 404, 'not_found');
      expectError(await call(h.app, reportPath('pat-1-sess-001'), { token: 'mock-admin' }), 403, 'forbidden');
      expectError(await call(h.app, link, { method: 'POST', token: 'mock-admin' }), 403, 'forbidden');
      expectError(await call(h.app, link, { method: 'POST', token: 'mock-nobody' }), 401, 'unauthenticated');
    });
  });

  describe('report links', () => {
    it('gives no link for a report without a PDF', async () => {
      expectError(await call(h.app, `${reportPath('pat-1-sess-002')}/link`, { method: 'POST' }), 404, 'not_found');
    });

    it('serves the PDF from a fresh link for five minutes, without caching or a referrer', async () => {
      const { url, expiresAt } = await createLink('pat-1-sess-001');
      expect(url).toMatch(/^\/api\/report-links\/[A-Za-z0-9_-]{43}$/);
      expect(Date.parse(expiresAt) - fixedNow.getTime()).toBe(5 * 60_000);
      expect((await createLink('pat-1-sess-001')).url).not.toBe(url);

      const res = await h.app.request(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdfBytes);

      h.setNow(new Date(Date.parse(expiresAt)));
      try {
        const expired = await h.app.request(url);
        expect(expired.headers.get('cache-control')).toBe('no-store');
        expectError({ status: expired.status, body: await expired.json() }, 404, 'not_found');
      } finally {
        h.setNow(fixedNow);
      }
    });

    it('returns 404 for an unknown or malformed token', async () => {
      for (const token of ['A'.repeat(43), 'not-a-token', `${'A'.repeat(42)}=`]) {
        const res = await h.app.request(`/api/report-links/${token}`);
        expectError({ status: res.status, body: await res.json() }, 404, 'not_found');
      }
    });
  });
};
