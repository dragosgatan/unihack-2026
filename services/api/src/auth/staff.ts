import { verifyWithJwks } from 'hono/jwt';
import { z } from 'zod';
import type { Staff } from '@tempo/shared';
import { cacheSuccess } from '../cache.ts';
import { bearerToken, HttpError } from '../http.ts';
import type { Store } from '../store/types.ts';

export type StaffAuth = (authorization: string | undefined) => Promise<Staff>;

const unauthenticated = (): HttpError => new HttpError('unauthenticated', 'Unknown or missing staff token');

export const createMockStaffAuth =
  (store: Store, tokens: ReadonlyMap<string, string>): StaffAuth =>
  async (authorization) => {
    const token = authorization === undefined ? 'mock-attending' : bearerToken(authorization);
    const staffId = token === undefined ? undefined : tokens.get(token);
    const staff = staffId === undefined ? undefined : await store.getStaff(staffId);
    if (!staff) throw unauthenticated();
    return staff;
  };

const jwksSchema = z.object({
  keys: z.array(
    z.object({
      kid: z.string().min(1),
      kty: z.string().min(1),
      alg: z.string().optional(),
      use: z.string().optional(),
      n: z.string().optional(),
      e: z.string().optional(),
    }),
  ),
});

export type CognitoStaffAuthOptions = {
  store: Store;
  region: string;
  userPoolId: string;
  clientId: string;
  clock: () => Date;
  fetchJwks?: (url: string) => Promise<unknown>;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`JWKS request failed with ${response.status}`);
  return response.json();
};

export const createCognitoStaffAuth = ({
  store,
  region,
  userPoolId,
  clientId,
  clock,
  fetchJwks = fetchJson,
}: CognitoStaffAuthOptions): StaffAuth => {
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const claimsSchema = z.object({
    sub: z.string().min(1),
    iss: z.literal(issuer),
    token_use: z.literal('access'),
    client_id: z.literal(clientId),
    exp: z.number(),
  });

  const signingKeys = cacheSuccess(async () =>
    jwksSchema.parse(await fetchJwks(`${issuer}/.well-known/jwks.json`)).keys,
  );

  const verifiedSub = async (token: string): Promise<string | undefined> => {
    try {
      const payload = await verifyWithJwks(token, {
        keys: await signingKeys(),
        allowedAlgorithms: ['RS256'],
        verification: { exp: false, nbf: false, iat: false },
      });
      const claims = claimsSchema.safeParse(payload);
      if (!claims.success || claims.data.exp * 1000 <= clock().getTime()) return undefined;
      return claims.data.sub;
    } catch {
      return undefined;
    }
  };

  return async (authorization) => {
    const token = bearerToken(authorization);
    const sub = token === undefined ? undefined : await verifiedSub(token);
    const staff = sub === undefined ? undefined : await store.getStaff(sub);
    if (!staff) throw unauthenticated();
    return staff;
  };
};
