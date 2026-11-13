import { describe, expect, it } from 'vitest';
import { signPatientToken, signSessionToken, verifyDeviceToken } from './device-tokens.ts';

const secret = 'test-secret-that-is-long-enough-for-hs256';
const now = new Date('2026-11-13T12:00:00.000Z');
const later = (ms: number): Date => new Date(now.getTime() + ms);

const swapPayload = (token: string, change: (claims: Record<string, unknown>) => Record<string, unknown>): string => {
  const [header, payload, signature] = token.split('.');
  const claims: Record<string, unknown> = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8'));
  return [header, Buffer.from(JSON.stringify(change(claims))).toString('base64url'), signature].join('.');
};

describe('device tokens', () => {
  it('round-trips a session token that lasts two hours', async () => {
    const { token, expiresAt } = await signSessionToken(secret, { sid: 'sess-1', pid: 'pat-1', inst: 'inst-1' }, now);
    expect(expiresAt).toBe('2026-11-13T14:00:00.000Z');
    expect(await verifyDeviceToken(secret, token, now)).toEqual({
      scope: 'session',
      sid: 'sess-1',
      pid: 'pat-1',
      inst: 'inst-1',
      exp: Date.parse(expiresAt) / 1000,
    });
  });

  it('round-trips a patient token that lasts 180 days', async () => {
    const { token, expiresAt } = await signPatientToken(secret, { pid: 'pat-1', inst: 'inst-1', did: 'dev-1' }, now);
    expect(Date.parse(expiresAt) - now.getTime()).toBe(180 * 86_400_000);
    expect(await verifyDeviceToken(secret, token, later(179 * 86_400_000))).toMatchObject({
      scope: 'patient',
      pid: 'pat-1',
      did: 'dev-1',
    });
  });

  it('refuses a token once it has expired', async () => {
    const { token } = await signSessionToken(secret, { sid: 'sess-1', pid: 'pat-1', inst: 'inst-1' }, now);
    expect(await verifyDeviceToken(secret, token, later(2 * 60 * 60_000 - 1000))).toBeDefined();
    expect(await verifyDeviceToken(secret, token, later(2 * 60 * 60_000))).toBeUndefined();
  });

  it('refuses a token signed with another secret', async () => {
    const { token } = await signSessionToken('another-secret', { sid: 'sess-1', pid: 'pat-1', inst: 'inst-1' }, now);
    expect(await verifyDeviceToken(secret, token, now)).toBeUndefined();
  });

  it('refuses a session token whose scope was changed to patient', async () => {
    const { token } = await signSessionToken(secret, { sid: 'sess-1', pid: 'pat-1', inst: 'inst-1' }, now);
    const tampered = swapPayload(token, (claims) => ({ ...claims, scope: 'patient', did: 'dev-forged' }));
    expect(await verifyDeviceToken(secret, tampered, now)).toBeUndefined();
  });

  it('refuses garbage', async () => {
    expect(await verifyDeviceToken(secret, 'device-unknown', now)).toBeUndefined();
  });
});
