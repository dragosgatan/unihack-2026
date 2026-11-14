import { describe, expect, it } from 'vitest';
import {
  routes,
  suggestionDecisionRequestSchema,
  suggestionListResponseSchema,
  suggestionParamsSchema,
} from './api.ts';
import {
  diagnosisLookupResponseSchema,
  lookupQuerySchema,
  medicationLookupResponseSchema,
} from './lookup.ts';

describe('lookupQuerySchema', () => {
  it('trims the query and needs 2 to 80 characters', () => {
    expect(lookupQuerySchema.parse({ q: '  levo ' })).toEqual({ q: 'levo' });
    expect(lookupQuerySchema.safeParse({ q: ' a ' }).success).toBe(false);
    expect(lookupQuerySchema.safeParse({ q: 'a'.repeat(81) }).success).toBe(false);
    expect(lookupQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe('lookup responses', () => {
  it('carry at most ten items and where they came from', () => {
    const medication = { name: 'Carbidopa/Levodopa (Oral Pill) 25-100 mg Tab', rxnormId: '197444' };
    expect(medicationLookupResponseSchema.safeParse({ items: [medication], source: 'live' }).success).toBe(true);
    expect(
      medicationLookupResponseSchema.safeParse({ items: Array(11).fill(medication), source: 'cache' }).success,
    ).toBe(false);
    expect(medicationLookupResponseSchema.safeParse({ items: [], source: 'offline' }).success).toBe(false);
    expect(
      diagnosisLookupResponseSchema.safeParse({ items: [{ code: 'G20.A1', label: "Parkinson's disease" }], source: 'fallback' })
        .success,
    ).toBe(true);
    expect(diagnosisLookupResponseSchema.safeParse({ items: [{ code: 'g20', label: 'x' }], source: 'live' }).success).toBe(
      false,
    );
  });
});

describe('suggestion decision', () => {
  it('accepts accepted and dismissed, and edited only with text', () => {
    expect(suggestionDecisionRequestSchema.safeParse({ status: 'accepted' }).success).toBe(true);
    expect(suggestionDecisionRequestSchema.safeParse({ status: 'dismissed' }).success).toBe(true);
    expect(suggestionDecisionRequestSchema.parse({ status: 'edited', editedText: ' Review dose timing. ' })).toEqual({
      status: 'edited',
      editedText: 'Review dose timing.',
    });
    expect(suggestionDecisionRequestSchema.safeParse({ status: 'edited' }).success).toBe(false);
    expect(suggestionDecisionRequestSchema.safeParse({ status: 'edited', editedText: '  ' }).success).toBe(false);
    expect(suggestionDecisionRequestSchema.safeParse({ status: 'proposed' }).success).toBe(false);
  });

  it('names the patient and the suggestion in the path', () => {
    expect(suggestionParamsSchema.safeParse({ patientId: 'pat-1', suggestionId: 'sugg-1' }).success).toBe(true);
    expect(suggestionListResponseSchema.safeParse({ suggestions: [] }).success).toBe(true);
    expect(routes.decideSuggestion.path).toBe('/api/patients/:patientId/suggestions/:suggestionId/decision');
  });
});
