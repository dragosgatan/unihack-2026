import { describe, expect, it } from 'vitest';
import { flagSchema } from './flag.ts';
import { sessionReportSchema } from './report.ts';
import { painSkip, patient, session } from './test-fixtures.ts';

const flag = {
  id: `${session.id}-finger-tapping.taps-per-second-right`,
  patientId: patient.id,
  sessionId: session.id,
  metricId: 'finger-tapping.taps-per-second',
  side: 'right',
  kind: 'reliable-change',
  value: 3.2,
  baseline: 4.1,
  createdAt: '2026-11-13T10:30:00.000Z',
};

const ai = {
  model: 'stub',
  promptVersion: 'session-summary@1',
  inputRef: `session:${session.id}`,
  provider: 'mock',
  createdAt: '2026-11-13T10:30:00.000Z',
};

const report = {
  sessionId: session.id,
  patientId: patient.id,
  generatedAt: '2026-11-13T10:30:00.000Z',
  skipped: [{ resultId: `${session.id}-r01`, ...painSkip }],
  scores: [
    {
      resultId: `${session.id}-r00`,
      activityId: 'finger-tapping',
      metricId: 'finger-tapping.taps-per-second',
      side: 'right',
      value: 3.2,
      unit: 'taps/s',
      scoredBy: 'code',
      baseline: 4.1,
      referenceBand: { low: 3.7, high: 4.5 },
      flagged: true,
    },
  ],
  aiItems: [],
  aiSummary: {
    label: 'ai-generated',
    summary: 'Tapping speed on the right was below the own range.',
    claims: [{ text: 'Tapping speed on the right was below the own range.', metricId: 'finger-tapping.taps-per-second' }],
    ai,
  },
};

describe('flagSchema', () => {
  it('accepts a reliable-change flag on one side', () => {
    expect(flagSchema.safeParse(flag).success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(flagSchema.safeParse({ ...flag, kind: 'bad-day' }).success).toBe(false);
  });
});

describe('sessionReportSchema', () => {
  it('accepts a report with a skip, a flagged score and a labelled AI summary', () => {
    expect(sessionReportSchema.safeParse(report).success).toBe(true);
  });

  it('rejects an AI summary that is not labelled as AI-generated', () => {
    const unlabelled = { ...report, aiSummary: { ...report.aiSummary, label: 'clinician' } };
    expect(sessionReportSchema.safeParse(unlabelled).success).toBe(false);
  });

  it('rejects an AI summary without its provenance', () => {
    const { summary, claims, label } = report.aiSummary;
    expect(sessionReportSchema.safeParse({ ...report, aiSummary: { summary, claims, label } }).success).toBe(false);
  });
});
