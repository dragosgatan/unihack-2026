import { describe, expect, it } from 'vitest';
import type { Suggestion } from '@tempo/shared';
import { canSaveEdit, evidenceLabel, evidenceTarget, groupSuggestions, newestFirst } from './suggestions.ts';

function suggestion(id: string, createdAt: string, overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id,
    patientId: 'pat-1',
    kind: 'review',
    text: 'Consider review.',
    evidence: [],
    status: 'proposed',
    createdAt,
    ai: { model: 'mock', promptVersion: 'suggest-review-1', inputRef: `suggestion:${id}` },
    ...overrides,
  };
}

describe('newestFirst', () => {
  it('orders by creation time, newest first, without changing the input', () => {
    const input = [suggestion('a', '2026-10-01T09:00:00.000Z'), suggestion('b', '2026-11-01T09:00:00.000Z'), suggestion('c', '2026-10-15T09:00:00.000Z')];
    expect(newestFirst(input).map((item) => item.id)).toEqual(['b', 'c', 'a']);
    expect(input.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('groupSuggestions', () => {
  it('keeps proposed suggestions open and every decided one in past, each newest first', () => {
    const groups = groupSuggestions([
      suggestion('old-open', '2026-10-01T09:00:00.000Z'),
      suggestion('accepted', '2026-10-05T09:00:00.000Z', { status: 'accepted' }),
      suggestion('new-open', '2026-11-01T09:00:00.000Z'),
      suggestion('edited', '2026-10-20T09:00:00.000Z', { status: 'edited', editedText: 'Changed' }),
      suggestion('dismissed', '2026-10-10T09:00:00.000Z', { status: 'dismissed' }),
    ]);
    expect(groups.open.map((item) => item.id)).toEqual(['new-open', 'old-open']);
    expect(groups.past.map((item) => item.id)).toEqual(['edited', 'dismissed', 'accepted']);
  });

  it('returns empty groups for no suggestions', () => {
    expect(groupSuggestions([])).toEqual({ open: [], past: [] });
  });
});

describe('evidenceTarget', () => {
  it('links metric evidence to the metric detail, even when it names a session', () => {
    expect(evidenceTarget('pat-1', { metricId: 'trail-making-a.time', sessionId: 'ses-1', label: 'x' })).toEqual({
      kind: 'internal',
      to: '/clinician/patients/pat-1/metrics/trail-making-a.time',
    });
  });

  it('links a source to its external page', () => {
    expect(evidenceTarget('pat-1', { label: 'Label', sourceUrl: 'https://example.org/label' })).toEqual({ kind: 'external', href: 'https://example.org/label' });
  });

  it('links session-only evidence to the session summary', () => {
    expect(evidenceTarget('pat-1', { sessionId: 'ses-1', label: 'x' })).toEqual({ kind: 'internal', to: '/clinician/patients/pat-1/sessions/ses-1' });
  });

  it('leaves plain evidence as text', () => {
    expect(evidenceTarget('pat-1', { t: '2026-10-01T00:00:00.000Z', label: 'Dose changed' })).toEqual({ kind: 'text' });
  });
});

describe('evidenceLabel', () => {
  it('replaces a leading metric id with the metric name', () => {
    expect(evidenceLabel({ metricId: 'trail-making-a.time', label: 'trail-making-a.time: 61 s, baseline 48 s' })).toBe('Trail Making A time: 61 s, baseline 48 s');
  });

  it('keeps other labels as they are', () => {
    expect(evidenceLabel({ metricId: 'trail-making-a.time', label: 'Slower than usual' })).toBe('Slower than usual');
    expect(evidenceLabel({ label: 'Dose changed' })).toBe('Dose changed');
  });
});

describe('canSaveEdit', () => {
  it('needs text that differs from the original after trimming', () => {
    expect(canSaveEdit('Consider review.', 'Consider review.')).toBe(false);
    expect(canSaveEdit('  Consider review.  ', 'Consider review.')).toBe(false);
    expect(canSaveEdit('   ', 'Consider review.')).toBe(false);
    expect(canSaveEdit('Consider review next week.', 'Consider review.')).toBe(true);
  });
});
