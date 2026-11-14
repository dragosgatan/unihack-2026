import { beforeEach, expect, it } from 'vitest';
import { routes } from '@tempo/shared';
import { buildSeed } from '../mock/seed/build.ts';
import { call, expectError, expectOk, fixedNow, type Harness, type HarnessFactory } from './harness.ts';

export const suggestionsSuite = (factory: HarnessFactory): void => {
  let h: Harness;
  let base: string;
  let suggestionId: string;

  beforeEach(async () => {
    h = await factory(buildSeed(fixedNow));
    base = `/api/patients/${h.id('pat-1')}/suggestions`;
    const [first] = expectOk(routes.listSuggestions, await call(h.app, base)).suggestions;
    suggestionId = first?.id ?? '';
  });

  const decide = (body: unknown, token?: string, id = suggestionId) =>
    call(h.app, `${base}/${id}/decision`, { method: 'POST', body, ...(token === undefined ? {} : { token }) });

  it('lists the seeded proposed review suggestion for the Parkinson patient with its evidence', async () => {
    const { suggestions } = expectOk(routes.listSuggestions, await call(h.app, base));
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ patientId: h.id('pat-1'), kind: 'review', status: 'proposed' });
    expect(suggestions[0]?.evidence).toHaveLength(3);
    expect(suggestions[0]?.evidence[2]?.sourceUrl).toMatch(/^https:\/\/api\.fda\.gov\//);
    const stroke = expectOk(routes.listSuggestions, await call(h.app, `/api/patients/${h.id('pat-2')}/suggestions`));
    expect(stroke.suggestions).toEqual([]);
  });

  it('records who accepted it and when', async () => {
    const { suggestion } = expectOk(routes.decideSuggestion, await decide({ status: 'accepted' }));
    expect(suggestion).toMatchObject({ status: 'accepted', decidedAt: fixedNow.toISOString() });
    const me = expectOk(routes.me, await call(h.app, '/api/me'));
    expect(suggestion.decidedBy).toBe(me.id);
    expect(expectOk(routes.listSuggestions, await call(h.app, base)).suggestions[0]).toEqual(suggestion);
  });

  it('keeps the edited text and drops it when the suggestion is dismissed later', async () => {
    const edited = expectOk(routes.decideSuggestion, await decide({ status: 'edited', editedText: '  Review at next visit.  ' }));
    expect(edited.suggestion).toMatchObject({ status: 'edited', editedText: 'Review at next visit.' });
    const dismissed = expectOk(routes.decideSuggestion, await decide({ status: 'dismissed' }));
    expect(dismissed.suggestion.status).toBe('dismissed');
    expect(dismissed.suggestion).not.toHaveProperty('editedText');
  });

  it('rejects an edit without text and an unknown status', async () => {
    expectError(await decide({ status: 'edited' }), 400, 'invalid_request');
    expectError(await decide({ status: 'edited', editedText: '   ' }), 400, 'invalid_request');
    expectError(await decide({ status: 'proposed' }), 400, 'invalid_request');
  });

  it('answers 404 for an unknown suggestion or one that belongs to another patient', async () => {
    expectError(await decide({ status: 'accepted' }, undefined, 'sugg-404'), 404, 'not_found');
    const other = await call(h.app, `/api/patients/${h.id('pat-2')}/suggestions/${suggestionId}/decision`, {
      method: 'POST',
      body: { status: 'accepted' },
    });
    expectError(other, 404, 'not_found');
  });

  it('refuses a clinician who is not assigned and an admin, and leaves the suggestion proposed', async () => {
    expectError(await call(h.app, base, { token: 'mock-therapist' }), 404, 'not_found');
    expectError(await decide({ status: 'accepted' }, 'mock-therapist'), 404, 'not_found');
    expectError(await call(h.app, base, { token: 'mock-admin' }), 403, 'forbidden');
    expectError(await decide({ status: 'accepted' }, 'mock-admin'), 403, 'forbidden');
    const [suggestion] = expectOk(routes.listSuggestions, await call(h.app, base)).suggestions;
    expect(suggestion?.status).toBe('proposed');
  });
};
