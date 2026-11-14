import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFRawStream, PDFRef, StandardFonts, type PDFPage } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { ReportScore, ReportSkip, SessionReport, SkipFlag } from '@tempo/shared';
import { renderSessionReportPdf, type ReportPdfInput } from './index.ts';
import { safeText } from './text.ts';

const ai = {
  model: 'mock',
  promptVersion: 'session-summary@1',
  inputRef: 'session:sess-1',
  provider: 'mock',
  createdAt: '2026-11-13T12:10:00.000Z',
} as const;

const baseReport: SessionReport = {
  sessionId: 'sess-1',
  patientId: 'pat-1',
  generatedAt: '2026-11-13T12:10:00.000Z',
  skipped: [],
  attention: [],
  scores: [],
  aiItems: [],
  aiSummary: { label: 'ai-generated', summary: 'No scores were recorded in this session.', claims: [], ai },
};

const skip = (index: number): ReportSkip => ({
  resultId: `sess-1-r${index}`,
  activityId: 'shoulder-raise',
  reason: 'pain',
  stage: 'task',
  skippedAt: '2026-11-13T11:00:00.000Z',
  painLocation: 'right-shoulder',
  note: `Durere în umărul drept, nota ${index}`,
});

const score = (index: number, flagged = false): ReportScore => ({
  resultId: `sess-1-r${index}`,
  activityId: 'finger-tapping',
  metricId: 'finger-tapping.taps-per-second',
  side: index % 2 === 0 ? 'right' : 'left',
  value: 2 + index / 10,
  unit: 'taps/s',
  scoredBy: 'code',
  baseline: 4,
  referenceBand: { low: 3.6, high: 4.4 },
  flagged,
});

const painFlag = (index: number): SkipFlag => ({
  id: `flag-${index}`,
  patientId: 'pat-1',
  sessionId: 'sess-1',
  kind: 'pain-skip',
  activityId: 'shoulder-raise',
  stage: 'task',
  painLocation: 'right-shoulder',
  createdAt: '2026-11-13T12:00:00.000Z',
});

const input = (report: Partial<SessionReport> = {}, overrides: Partial<ReportPdfInput> = {}): ReportPdfInput => ({
  report: { ...baseReport, ...report },
  patient: { name: 'Elena Dorian', institutionPatientId: 'RRC-00417', dateOfBirth: '1951-04-22' },
  session: { mode: 'kiosk', partial: false, createdAt: '2026-11-13T11:00:00.000Z', startedAt: '2026-11-13T11:02:00.000Z' },
  history: [],
  ...overrides,
});

const history = Array.from({ length: 8 }, (_, index) => ({
  t: new Date(Date.UTC(2026, 5 + Math.floor(index / 2), 1 + index * 3, 10)).toISOString(),
  value: 4 - index * 0.2,
  sessionId: `sess-h${index}`,
}));

const contentStreams = (doc: PDFDocument, page: PDFPage): PDFRawStream[] => {
  const contents = page.node.Contents();
  const items = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  return items
    .map((item) => (item instanceof PDFRef ? doc.context.lookup(item) : item))
    .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream);
};

const pageTexts = async (pdf: Uint8Array): Promise<string[]> => {
  const doc = await PDFDocument.load(pdf);
  return doc.getPages().map((page) =>
    contentStreams(doc, page)
      .map((stream) => inflateSync(stream.getContents()).toString('latin1'))
      .flatMap((decoded) => [...decoded.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)])
      .map((match) => Buffer.from(match[1] ?? '', 'hex').toString('latin1'))
      .join('\n'),
  );
};

describe('renderSessionReportPdf', () => {
  it('renders a valid PDF with one summary page for a session without scores', async () => {
    const pdf = await renderSessionReportPdf(input({ skipped: [skip(0)] }));
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    const [summary, ...rest] = await pageTexts(pdf);
    expect(rest).toEqual([]);
    expect(summary).toContain('Tempo session report');
    expect(summary).toContain('Elena Dorian');
    expect(summary).toContain('Patient ID: RRC-00417');
    expect(summary).toContain('Date of birth: 1951-04-22');
    expect(summary).toContain('Mode: Kiosk');
    expect(summary).toContain('Status: Completed with skips');
    expect(summary).toContain('Decision support, not a diagnosis.');
    expect(summary).toContain('Shoulder raise: It hurts. Stopped at: Task.');
    expect(summary).toContain('Location: Right shoulder.');
    expect(summary).toContain('No scored activities in this session.');
    expect(summary).toContain('AI-generated summary');
    expect(summary).toContain('Prompt version: session-summary@1');
  });

  it('lists skipped activities before scores and labels the band as the own range', async () => {
    const pdf = await renderSessionReportPdf(input({ skipped: [skip(0)], scores: [score(0, true)] }));
    const [summary = ''] = await pageTexts(pdf);
    expect(summary.indexOf('Skipped activities')).toBeLessThan(summary.indexOf('Scores'));
    expect(summary).toContain('Own range');
    expect(summary).toContain('3.6 taps/s to 4.4 taps/s');
    expect(summary).toContain('* Flagged change, for clinician review.');
    expect(summary.toLowerCase()).not.toContain('normal range');
  });

  it('marks a partial home session', async () => {
    const pdf = await renderSessionReportPdf(input({}, { session: { mode: 'home', partial: true, createdAt: '2026-11-13T11:00:00.000Z' } }));
    const [summary] = await pageTexts(pdf);
    expect(summary).toContain('Mode: Home');
    expect(summary).toContain('Status: Completed (partial)');
  });

  it('keeps long lists on one summary page and says how many are left out', async () => {
    const report = {
      skipped: Array.from({ length: 30 }, (_, index) => skip(index)),
      attention: Array.from({ length: 12 }, (_, index) => painFlag(index)),
      scores: Array.from({ length: 25 }, (_, index) => score(index, index % 3 === 0)),
      aiSummary: { ...baseReport.aiSummary, summary: 'Tapping was slower than the own range. '.repeat(80) },
    };
    const pdf = await renderSessionReportPdf(input(report));
    const pages = await pageTexts(pdf);
    const [summary = ''] = pages;
    expect(summary).toContain('and 25 more');
    expect(summary).toContain('and 9 more');
    expect(summary).toContain('and 15 more');
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.slice(1).join('\n').match(/Finger tapping: Taps per second/g)).toHaveLength(25);
  });

  it('draws one detail block per score with its baseline, previous value and change', async () => {
    const pdf = await renderSessionReportPdf(
      input(
        { scores: [score(0, true)] },
        { history: [{ metricId: 'finger-tapping.taps-per-second', side: 'right', previous: 2.6, points: history }] },
      ),
    );
    const pages = await pageTexts(pdf);
    expect(pages).toHaveLength(2);
    const details = pages[1] ?? '';
    expect(details).toContain('Finger tapping: Taps per second (right)');
    expect(details).toContain('This session: 2 taps/s');
    expect(details).toContain('Baseline: 4 taps/s');
    expect(details).toContain('Previous: 2.6 taps/s');
    expect(details).toContain('Change from previous: -0.6 taps/s');
    expect(details).toContain('Page 2 of 2');
  });

  it('draws text a standard font cannot encode without throwing', async () => {
    const pdf = await renderSessionReportPdf(
      input(
        {
          skipped: [{ ...skip(0), note: 'Șoldul și brațul țin, ă î â 痛 🙂' }],
          aiSummary: { ...baseReport.aiSummary, summary: 'Pacienta a făcut ședința; mișcarea umărului e limitată. Łódź' },
        },
        { patient: { name: 'Ștefania Țurcanu-Bălănescu', institutionPatientId: 'RRC-ȘȚ', dateOfBirth: '1951-04-22' } },
      ),
    );
    const [summary] = await pageTexts(pdf);
    expect(summary).toContain('Stefania Turcanu-Balanescu');
    expect(summary).toContain('Note: Soldul si bratul tin, a î â ? ?');
    expect(summary).toContain('Pacienta a facut sedinta');
  });
});

describe('safeText', () => {
  it('keeps WinAnsi letters, strips Romanian diacritics and replaces the rest', async () => {
    const doc = await PDFDocument.create();
    const charset = new Set((await doc.embedFont(StandardFonts.Helvetica)).getCharacterSet());
    expect(safeText('Ș ș Ț ț Ş ş Ţ ţ Ă ă Â â Î î', charset)).toBe('S s T t S s T t A a Â â Î î');
    expect(safeText('é ü ° – €', charset)).toBe('é ü ° – €');
    expect(safeText('痛 Ł 🙂', charset)).toBe('? ? ?');
    expect(safeText('two\nlines\tand  tabs', charset)).toBe('two lines and tabs');
  });
});
