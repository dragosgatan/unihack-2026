import { describe, expect, it } from 'vitest';
import type { PairedDevice } from '@tempo/shared';
import { groupCode, isExpired, newlyPaired, orderDevices, pairedCountLabel, pairingUrl, spellDigits } from './pairing.ts';

function device(id: string, pairedAt: string, revokedAt?: string): PairedDevice {
  return { id, patientId: 'pat-1', pairedAt, ...(revokedAt === undefined ? {} : { revokedAt, revokedBy: 'staff-1' }) };
}

const older = device('dev-old', '2026-11-01T10:00:00.000Z');
const newer = device('dev-new', '2026-11-10T10:00:00.000Z');
const revokedEarly = device('dev-r1', '2026-10-01T10:00:00.000Z', '2026-10-05T10:00:00.000Z');
const revokedLate = device('dev-r2', '2026-10-02T10:00:00.000Z', '2026-11-12T10:00:00.000Z');

describe('pairingUrl', () => {
  it('points at home mode with only the code', () => {
    expect(pairingUrl('https://tempo.example', '123456')).toBe('https://tempo.example/patient/home?code=123456');
  });
});

describe('isExpired', () => {
  const expiresAt = '2026-11-14T14:32:00.000Z';
  it('is false before and true from the expiry time', () => {
    expect(isExpired(expiresAt, Date.parse(expiresAt) - 1)).toBe(false);
    expect(isExpired(expiresAt, Date.parse(expiresAt))).toBe(true);
  });
});

describe('orderDevices', () => {
  it('lists active phones newest first, then revoked ones most recently revoked first', () => {
    expect(orderDevices([revokedEarly, older, revokedLate, newer]).map((d) => d.id)).toEqual(['dev-new', 'dev-old', 'dev-r2', 'dev-r1']);
  });
});

describe('newlyPaired', () => {
  const known = new Set(['dev-old']);
  it('finds an active phone that was not in the list when the code was made', () => {
    expect(newlyPaired([older, newer], known)?.id).toBe('dev-new');
  });
  it('ignores phones already known and revoked phones', () => {
    expect(newlyPaired([older], known)).toBeUndefined();
    expect(newlyPaired([device('dev-x', '2026-11-10T10:00:00.000Z', '2026-11-11T10:00:00.000Z')], known)).toBeUndefined();
  });
});

describe('code text', () => {
  it('groups the code in threes and spells it digit by digit', () => {
    expect(groupCode('123456')).toEqual(['123', '456']);
    expect(spellDigits('123456')).toBe('1 2 3 4 5 6');
  });
});

describe('pairedCountLabel', () => {
  it('counts active phones only', () => {
    expect(pairedCountLabel([])).toBe('Not paired');
    expect(pairedCountLabel([revokedEarly])).toBe('Not paired');
    expect(pairedCountLabel([older, revokedEarly])).toBe('1 phone paired');
    expect(pairedCountLabel([older, newer])).toBe('2 phones paired');
  });
});
