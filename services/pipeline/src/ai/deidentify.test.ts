import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { deidentify, redactedPlaceholder } from './deidentify.ts';

describe('deidentify.text', () => {
  it('replaces every identifier regardless of case', () => {
    const text = 'Ion Popescu (ID 4471) said ion popescu fell. Ask Ion.';
    expect(deidentify.text(text, ['Ion', 'Ion Popescu', '4471'])).toBe(
      `${redactedPlaceholder} (ID ${redactedPlaceholder}) said ${redactedPlaceholder} fell. Ask ${redactedPlaceholder}.`,
    );
  });

  it('treats identifiers as literal text', () => {
    expect(deidentify.text('ref a.b and axb', ['a.b'])).toBe(`ref ${redactedPlaceholder} and axb`);
  });

  it('ignores blank identifiers', () => {
    expect(deidentify.text('unchanged', ['', '  '])).toBe('unchanged');
  });

  it('handles diacritics', () => {
    expect(deidentify.text('Ștefan a căzut, ȘTEFAN', ['Ștefan'])).toBe(
      `${redactedPlaceholder} a căzut, ${redactedPlaceholder}`,
    );
  });
});

describe('deidentify.fields', () => {
  it('keeps only allowlisted fields, nested ones included', () => {
    const allowed = z.object({ items: z.array(z.object({ value: z.number() })) });
    const value = { patientId: 'pat-1', name: 'Ana', items: [{ value: 1, patientId: 'pat-1' }] };
    expect(deidentify.fields(allowed, value)).toEqual({ items: [{ value: 1 }] });
  });
});
