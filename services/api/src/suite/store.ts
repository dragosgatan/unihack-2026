import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Flag, Session, SubmittedResult, Suggestion } from '@tempo/shared';
import type { Store } from '../store/types.ts';

export type StoreFactory = () => Store;

const unique = (name: string): string => `${name}-${randomUUID().slice(0, 8)}`;

const sessionFor = (patientId: string, id: string, createdAt: string): Session => ({
  id,
  patientId,
  planId: 'plan-1',
  planVersion: 1,
  mode: 'kiosk',
  status: 'created',
  partial: false,
  createdAt,
});

const suggestionFor = (patientId: string, id: string, createdAt: string): Suggestion => ({
  id,
  patientId,
  kind: 'review',
  text: 'Tapping is below baseline since a dose change; the label lists dyskinesia — consider review.',
  evidence: [{ label: 'Drug label lists dyskinesia', sourceUrl: 'https://api.fda.gov/drug/label.json?search=set_id:x' }],
  status: 'proposed',
  createdAt,
  ai: { model: 'mock', promptVersion: 'suggest-review-1', inputRef: `suggestion:${id}` },
});

export const storeSuite = (factory: StoreFactory): void => {
  describe('public data cache', () => {
    it('keeps one entry per kind and query and replaces it on the next write', async () => {
      const store = factory();
      const query = unique('levodopa');
      const entry = {
        kind: 'rxnorm' as const,
        query,
        fetchedAt: '2026-11-13T10:00:00.000Z',
        keepUntil: '2026-12-13T10:00:00.000Z',
        value: [{ name: 'Carbidopa/Levodopa (Oral Pill) 25-100 mg Tab', rxnormId: '197444' }],
      };
      expect(await store.getPublicData('rxnorm', query)).toBeUndefined();
      await store.putPublicData(entry);
      expect(await store.getPublicData('rxnorm', query)).toEqual(entry);
      expect(await store.getPublicData('icd10', query)).toBeUndefined();
      const newer = { ...entry, fetchedAt: '2026-11-14T10:00:00.000Z', value: { label: null } };
      await store.putPublicData(newer);
      expect(await store.getPublicData('rxnorm', query)).toEqual(newer);
    });
  });

  describe('suggestions', () => {
    it('creates a suggestion once and never overwrites it', async () => {
      const store = factory();
      const patientId = unique('pat');
      const suggestion = suggestionFor(patientId, unique('sugg'), '2026-11-13T10:00:00.000Z');
      expect(await store.createSuggestion(suggestion)).toBe(true);
      expect(await store.createSuggestion({ ...suggestion, text: 'Another text.' })).toBe(false);
      expect(await store.getSuggestion(patientId, suggestion.id)).toEqual(suggestion);
      expect(await store.getSuggestion(unique('pat'), suggestion.id)).toBeUndefined();
    });

    it('lists only that patient’s suggestions, newest first', async () => {
      const store = factory();
      const patientId = unique('pat');
      const older = suggestionFor(patientId, unique('sugg'), '2026-11-01T10:00:00.000Z');
      const newer = suggestionFor(patientId, unique('sugg'), '2026-11-12T10:00:00.000Z');
      await store.createSuggestion(older);
      await store.createSuggestion(newer);
      await store.createSuggestion(suggestionFor(unique('pat'), unique('sugg'), '2026-11-05T10:00:00.000Z'));
      expect(await store.listSuggestions(patientId)).toEqual([newer, older]);
    });

    it('records a decision, keeps edited text only while edited, and ignores an unknown suggestion', async () => {
      const store = factory();
      const patientId = unique('pat');
      const suggestion = suggestionFor(patientId, unique('sugg'), '2026-11-13T10:00:00.000Z');
      await store.createSuggestion(suggestion);
      const by = { decidedBy: 'staff-att-1', decidedAt: '2026-11-13T12:00:00.000Z' };

      const edited = await store.decideSuggestion(patientId, suggestion.id, { status: 'edited', editedText: 'Review.', ...by });
      expect(edited).toEqual({ ...suggestion, status: 'edited', editedText: 'Review.', ...by });
      const accepted = await store.decideSuggestion(patientId, suggestion.id, { status: 'accepted', ...by });
      expect(accepted).toEqual({ ...suggestion, status: 'accepted', ...by });
      expect(await store.getSuggestion(patientId, suggestion.id)).toEqual(accepted);
      expect(await store.createSuggestion(suggestion)).toBe(false);
      expect(await store.getSuggestion(patientId, suggestion.id)).toEqual(accepted);

      expect(await store.decideSuggestion(patientId, unique('sugg'), { status: 'dismissed', ...by })).toBeUndefined();
      expect(await store.getSuggestion(patientId, 'sugg-missing')).toBeUndefined();
    });
  });

  describe('pain alert claim', () => {
    it('is granted once per session until it is released', async () => {
      const store = factory();
      const sessionId = unique('sess');
      expect(await store.claimPainAlert(sessionId)).toBe(true);
      expect(await store.claimPainAlert(sessionId)).toBe(false);
      expect(await store.claimPainAlert(unique('sess'))).toBe(true);
      await store.releasePainAlert(sessionId);
      expect(await store.claimPainAlert(sessionId)).toBe(true);
    });
  });

  describe('patient sessions', () => {
    it('lists only that patient’s sessions, oldest first', async () => {
      const store = factory();
      const patientId = unique('pat');
      const later = sessionFor(patientId, unique('sess'), '2026-11-10T10:00:00.000Z');
      const earlier = sessionFor(patientId, unique('sess'), '2026-11-03T10:00:00.000Z');
      await store.putSession(later);
      await store.putSession(earlier);
      await store.putSession(sessionFor(unique('pat'), unique('sess'), '2026-11-05T10:00:00.000Z'));
      expect(await store.listPatientSessions(patientId)).toEqual([earlier, later]);
    });
  });

  describe('flags', () => {
    it('keeps every kind and overwrites the same flag instead of adding it twice', async () => {
      const store = factory();
      const patientId = unique('pat');
      const sessionId = unique('sess');
      const base = { patientId, sessionId, createdAt: '2026-11-13T10:00:00.000Z' };
      const flags: Flag[] = [
        { ...base, id: 'f1', kind: 'reliable-change', metricId: 'finger-tapping.taps-per-second', side: 'right', value: 2, baseline: 4 },
        { ...base, id: 'f2', kind: 'pain-skip', activityId: 'shoulder-raise', stage: 'task', painLocation: 'right-shoulder' },
        { ...base, id: 'f3', kind: 'repeated-skip', activityId: 'shoulder-raise', previousSessionId: 'sess-0', reason: 'pain' },
      ];
      await store.putFlags(flags);
      await store.putFlags(flags);
      const stored = await store.listFlags(patientId, sessionId);
      expect([...stored].sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual(flags);
    });

    it('lists every flag of a patient across sessions, newest first', async () => {
      const store = factory();
      const patientId = unique('pat');
      const older: Flag = {
        id: unique('flag'),
        patientId,
        sessionId: unique('sess'),
        kind: 'pain-skip',
        activityId: 'shoulder-raise',
        stage: 'task',
        createdAt: '2026-11-01T10:00:00.000Z',
      };
      const newer: Flag = {
        id: unique('flag'),
        patientId,
        sessionId: unique('sess'),
        kind: 'reliable-change',
        metricId: 'sit-to-stand.count',
        value: 6,
        baseline: 10,
        createdAt: '2026-11-12T10:00:00.000Z',
      };
      await store.putFlags([older, newer, { ...newer, id: unique('flag'), patientId: unique('pat') }]);
      expect(await store.listPatientFlags(patientId)).toEqual([newer, older]);
      expect(await store.listPatientFlags(unique('pat'))).toEqual([]);
    });
  });

  describe('check-in entries', () => {
    const results: SubmittedResult[] = [
      {
        status: 'completed',
        completedAt: '2026-11-13T10:01:00.000Z',
        raw: { activityId: 'check-in-pain', data: { item: 'pain', intensity: 3, location: 'right-shoulder' } },
      },
      {
        status: 'completed',
        completedAt: '2026-11-13T10:02:00.000Z',
        raw: {
          activityId: 'check-in-medication',
          data: { item: 'medication', medications: [{ medicationId: 'med-3', name: 'Clopidogrel', status: 'taken' }] },
        },
      },
      { status: 'skipped', activityId: 'check-in-episodes', reason: 'tired', stage: 'instructions', skippedAt: '2026-11-13T10:03:00.000Z' },
      {
        status: 'completed',
        completedAt: '2026-11-13T10:09:00.000Z',
        raw: { activityId: 'sit-to-stand', data: { durationMs: 30000, reps: [] } },
      },
    ];

    it('keeps each completed check-in of a submitted session once, and nothing for skips or other activities', async () => {
      const store = factory();
      const patientId = unique('pat');
      const session = { ...sessionFor(patientId, unique('sess'), '2026-11-13T10:00:00.000Z'), status: 'in-progress' as const };
      await store.putSession(session);
      const submission = { partial: false, submittedAt: '2026-11-13T10:10:00.000Z', results };
      expect(await store.submitSession(session, submission)).toBe('submitted');
      expect(await store.submitSession(session, submission)).toBe('submitted');

      const day = { from: '2026-11-13T00:00:00.000Z', to: '2026-11-13T23:59:59.999Z' };
      const entries = await store.listCheckIns(patientId, day);
      expect(entries).toEqual([
        {
          id: `${session.id}-r00`,
          patientId,
          sessionId: session.id,
          recordedAt: '2026-11-13T10:01:00.000Z',
          recordedBy: { kind: 'patient' },
          body: { item: 'pain', intensity: 3, location: 'right-shoulder' },
        },
        {
          id: `${session.id}-r01`,
          patientId,
          sessionId: session.id,
          recordedAt: '2026-11-13T10:02:00.000Z',
          recordedBy: { kind: 'patient' },
          body: { item: 'medication', medications: [{ medicationId: 'med-3', name: 'Clopidogrel', status: 'taken' }] },
        },
      ]);
      expect(await store.listCheckIns(patientId, { from: '2026-11-13T10:01:30.000Z', to: day.to })).toEqual(entries.slice(1));
      expect(await store.listCheckIns(unique('pat'), day)).toEqual([]);
    });
  });
};
