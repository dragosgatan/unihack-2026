import { describe, expect, it } from 'vitest';
import { auditEntrySchema, institutionSchema, pairedDeviceSchema, patientSchema, staffSchema } from './entities.ts';
import { attending, institution, pairedDevice, patient } from './test-fixtures.ts';

describe('institutionSchema', () => {
  it('accepts an institution', () => {
    expect(institutionSchema.safeParse(institution).success).toBe(true);
  });
});

describe('staffSchema', () => {
  it('accepts a staff member', () => {
    expect(staffSchema.safeParse(attending).success).toBe(true);
  });
});

describe('patientSchema', () => {
  it('accepts a patient', () => {
    expect(patientSchema.safeParse(patient).success).toBe(true);
  });
});

describe('auditEntrySchema', () => {
  it('accepts a record read', () => {
    const entry = {
      id: 'audit-1',
      institutionId: institution.id,
      actorId: attending.id,
      actorRole: 'attending',
      action: 'read',
      entityType: 'medical-record',
      entityId: patient.id,
      patientId: patient.id,
      at: '2026-11-13T10:02:00.000Z',
    };
    expect(auditEntrySchema.safeParse(entry).success).toBe(true);
  });
});

describe('pairedDeviceSchema', () => {
  it('accepts a paired device', () => {
    expect(pairedDeviceSchema.safeParse(pairedDevice).success).toBe(true);
  });

  it('accepts a revoked device', () => {
    const revoked = { ...pairedDevice, revokedAt: '2026-11-14T09:00:00.000Z', revokedBy: attending.id };
    expect(pairedDeviceSchema.safeParse(revoked).success).toBe(true);
  });
});
