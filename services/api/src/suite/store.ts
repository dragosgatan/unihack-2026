import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Flag, Session } from '@tempo/shared';
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

export const storeSuite = (factory: StoreFactory): void => {
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
  });
};
