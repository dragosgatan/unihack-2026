import { describe, expect, it } from 'vitest';
import { checkInEntrySchema, episodeSchema } from './checkin.ts';
import { patient, session, therapist } from './test-fixtures.ts';

const entry = {
  id: 'chk-1',
  patientId: patient.id,
  sessionId: session.id,
  recordedAt: '2026-11-13T10:01:00.000Z',
  recordedBy: { kind: 'patient' },
};

describe('checkInEntrySchema', () => {
  it('accepts a pain entry', () => {
    const body = { item: 'pain', intensity: 4, location: 'right-shoulder', type: 'ache' };
    expect(checkInEntrySchema.safeParse({ ...entry, body }).success).toBe(true);
  });

  it('rejects pain above 10', () => {
    const body = { item: 'pain', intensity: 11, location: 'right-shoulder', type: 'ache' };
    expect(checkInEntrySchema.safeParse({ ...entry, body }).success).toBe(false);
  });

  it('accepts a medication entry logged by staff', () => {
    const body = {
      item: 'medication',
      medications: [{ medicationId: 'med-1', name: 'Levodopa/Carbidopa', status: 'missed', sideEffects: 'Nausea' }],
    };
    const recordedBy = { kind: 'staff', staffId: therapist.id };
    expect(checkInEntrySchema.safeParse({ ...entry, recordedBy, body }).success).toBe(true);
  });

  it('accepts an episodes entry', () => {
    const body = { item: 'episodes', episodes: [{ type: 'fall', count: 1 }, { type: 'dizziness', count: 0 }] };
    expect(checkInEntrySchema.safeParse({ ...entry, body }).success).toBe(true);
  });

  it('rejects an unknown check-in item', () => {
    const body = { item: 'mood', value: 3 };
    expect(checkInEntrySchema.safeParse({ ...entry, body }).success).toBe(false);
  });
});

describe('episodeSchema', () => {
  it('accepts a fall reported at check-in', () => {
    const episode = {
      id: 'ep-1',
      patientId: patient.id,
      type: 'fall',
      count: 1,
      occurredAt: '2026-11-13T10:01:00.000Z',
      windowStart: '2026-11-10T10:30:00.000Z',
      description: 'Slipped getting out of bed',
      severity: 'mild',
      source: 'check-in',
    };
    expect(episodeSchema.safeParse(episode).success).toBe(true);
  });
});
