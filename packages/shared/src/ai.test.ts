import { describe, expect, it } from 'vitest';
import {
  aiOutputSchema,
  clockDrawingScoreSchema,
  episodeDraftSchema,
  recordDraftSchema,
  sessionSummarySchema,
} from './ai.ts';

const meta = {
  model: 'gemini-3.8-flash',
  promptVersion: 'session-summary-1',
  inputRef: 'sess-1',
  provider: 'gemini',
  createdAt: '2026-11-13T12:00:00.000Z',
};

const criterion = (score: number) => ({ score, justification: 'Seen in the drawing.' });

describe('aiOutputSchema', () => {
  it('wraps an output with its provenance', () => {
    const schema = aiOutputSchema(sessionSummarySchema);
    const output = { summary: 'Tapping was slower than baseline.', claims: [] };
    expect(schema.parse({ output, meta })).toEqual({ output, meta });
  });

  it('rejects an envelope without an input reference', () => {
    const schema = aiOutputSchema(sessionSummarySchema);
    const result = schema.safeParse({ output: { summary: 'x', claims: [] }, meta: { ...meta, inputRef: '' } });
    expect(result.success).toBe(false);
  });
});

describe('clockDrawingScoreSchema', () => {
  it('accepts a total that matches the criteria', () => {
    const score = { contour: criterion(1), numbers: criterion(0), hands: criterion(1), total: 2, confidence: 0.8 };
    expect(clockDrawingScoreSchema.safeParse(score).success).toBe(true);
  });

  it('rejects a total that does not match the criteria', () => {
    const score = { contour: criterion(1), numbers: criterion(0), hands: criterion(1), total: 3, confidence: 0.8 };
    expect(clockDrawingScoreSchema.safeParse(score).success).toBe(false);
  });
});

describe('sessionSummarySchema', () => {
  it('rejects a claim without a known metric', () => {
    const summary = { summary: 'x', claims: [{ text: 'y', metricId: 'mood.score' }] };
    expect(sessionSummarySchema.safeParse(summary).success).toBe(false);
  });
});

describe('recordDraftSchema', () => {
  it('drops identity fields the model adds', () => {
    const draft = recordDraftSchema.parse({
      patientName: 'Maria Ionescu',
      dateOfBirth: '1950-01-01',
      diagnoses: [{ label: 'Ischaemic stroke', code: 'I63.9' }],
      medications: [{ name: 'Aspirin', dose: '75 mg', frequency: 'once daily' }],
      historyNotes: ['Hypertension for 10 years'],
    });
    expect(Object.keys(draft).sort()).toEqual(['diagnoses', 'historyNotes', 'medications']);
  });

  it('rejects a malformed ICD-10 code', () => {
    const draft = { diagnoses: [{ label: 'Stroke', code: 'stroke' }], medications: [], historyNotes: [] };
    expect(recordDraftSchema.safeParse(draft).success).toBe(false);
  });
});

describe('episodeDraftSchema', () => {
  it('accepts an episode without a severity', () => {
    const draft = { type: 'fall', when: 'Yesterday evening', circumstances: 'Slipped in the bathroom' };
    expect(episodeDraftSchema.safeParse(draft).success).toBe(true);
  });
});
