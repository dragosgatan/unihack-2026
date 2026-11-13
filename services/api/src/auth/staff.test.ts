import { generateKeyPairSync } from 'node:crypto';
import { sign } from 'hono/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { HttpError } from '../http.ts';
import { buildSeed } from '../mock/seed/build.ts';
import { attending } from '../mock/seed/institution.ts';
import { createMemoryStore } from '../store/memory.ts';
import { createCognitoStaffAuth, type StaffAuth } from './staff.ts';

const now = new Date('2026-11-13T12:00:00.000Z');
const region = 'eu-central-1';
const userPoolId = 'eu-central-1_TestPool';
const clientId = 'web-client-id';
const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'test-key';
const privateJwk = { ...privateKey.export({ format: 'jwk' }), alg: 'RS256', kid };
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), alg: 'RS256', kid, use: 'sig' }] };

const exp = Math.floor(now.getTime() / 1000) + 3600;
const accessClaims = {
  sub: attending.id,
  iss: issuer,
  token_use: 'access',
  client_id: clientId,
  exp,
  iat: exp - 3600,
};

const errorCode = async (promise: Promise<unknown>): Promise<string | undefined> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof HttpError ? error.code : 'not-an-http-error';
  }
};

describe('Cognito staff auth', () => {
  let fetched: string[];
  let auth: StaffAuth;

  beforeEach(() => {
    fetched = [];
    auth = createCognitoStaffAuth({
      store: createMemoryStore(buildSeed(now)),
      region,
      userPoolId,
      clientId,
      clock: () => now,
      fetchJwks: async (url) => {
        fetched.push(url);
        return jwks;
      },
    });
  });

  const bearer = async (claims: Record<string, unknown>): Promise<string> =>
    `Bearer ${await sign(claims, privateJwk, 'RS256')}`;

  it('accepts a valid access token and resolves the staff member by sub', async () => {
    const staff = await auth(await bearer(accessClaims));
    expect(staff).toEqual(attending);
    await auth(await bearer(accessClaims));
    expect(fetched).toEqual([`${issuer}/.well-known/jwks.json`]);
  });

  it('refuses a token for another client', async () => {
    expect(await errorCode(auth(await bearer({ ...accessClaims, client_id: 'other-client' })))).toBe('unauthenticated');
  });

  it('refuses an id token', async () => {
    const idToken = { ...accessClaims, token_use: 'id', aud: clientId };
    expect(await errorCode(auth(await bearer(idToken)))).toBe('unauthenticated');
  });

  it('refuses an expired token', async () => {
    const expired = { ...accessClaims, exp: Math.floor(now.getTime() / 1000) };
    expect(await errorCode(auth(await bearer(expired)))).toBe('unauthenticated');
  });

  it('refuses a token from another issuer', async () => {
    expect(await errorCode(auth(await bearer({ ...accessClaims, iss: 'https://example.test/pool' })))).toBe(
      'unauthenticated',
    );
  });

  it('refuses a token signed with another key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' });
    const forged = await sign(accessClaims, { ...other, alg: 'RS256', kid }, 'RS256');
    expect(await errorCode(auth(`Bearer ${forged}`))).toBe('unauthenticated');
  });

  it('refuses a valid token whose sub is not a staff member', async () => {
    expect(await errorCode(auth(await bearer({ ...accessClaims, sub: 'unknown-sub' })))).toBe('unauthenticated');
  });

  it('refuses a missing or malformed header', async () => {
    expect(await errorCode(auth(undefined))).toBe('unauthenticated');
    expect(await errorCode(auth('Basic abc'))).toBe('unauthenticated');
  });
});
