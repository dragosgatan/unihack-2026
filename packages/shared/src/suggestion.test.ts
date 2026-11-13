import { describe, expect, it } from 'vitest';
import { aiProvenanceSchema, suggestionSchema } from './suggestion.ts';
import { attending, patient, session } from './test-fixtures.ts';

const ai = { model: 'gemini-mock', promptVersion: 'suggestions-v1', inputRef: 's3://tempo-inputs/sugg-1.json' };

describe('aiProvenanceSchema', () => {
  it('accepts model, prompt version and input reference', () => {
    expect(aiProvenanceSchema.safeParse(ai).success).toBe(true);
  });
});

describe('suggestionSchema', () => {
  it('accepts an edited suggestion with evidence', () => {
    const suggestion = {
      id: 'sugg-1',
      patientId: patient.id,
      kind: 'review',
      text: 'Consider reviewing the timing of the evening dose against the tapping trend.',
      evidence: [
        { metricId: 'finger-tapping.taps-per-second', sessionId: session.id, t: '2026-11-13T10:20:00.000Z', label: 'Right-hand tapping rate' },
        { label: 'Drug label: dyskinesia', sourceUrl: 'https://api.fda.gov/drug/label.json' },
      ],
      status: 'edited',
      editedText: 'Review evening dose timing at next visit.',
      decidedBy: attending.id,
      decidedAt: '2026-11-13T12:00:00.000Z',
      createdAt: '2026-11-13T10:30:00.000Z',
      ai,
    };
    expect(suggestionSchema.safeParse(suggestion).success).toBe(true);
  });
});
