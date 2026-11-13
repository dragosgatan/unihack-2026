import { sign, verify } from 'hono/jwt';
import { z } from 'zod';

const sessionClaimsSchema = z.object({
  scope: z.literal('session'),
  sid: z.string().min(1),
  pid: z.string().min(1),
  inst: z.string().min(1),
  exp: z.number().int(),
});

const patientClaimsSchema = z.object({
  scope: z.literal('patient'),
  pid: z.string().min(1),
  inst: z.string().min(1),
  did: z.string().min(1),
  exp: z.number().int(),
});

const deviceClaimsSchema = z.discriminatedUnion('scope', [sessionClaimsSchema, patientClaimsSchema]);

export type SessionClaims = z.infer<typeof sessionClaimsSchema>;
export type PatientClaims = z.infer<typeof patientClaimsSchema>;
export type DeviceClaims = z.infer<typeof deviceClaimsSchema>;

export type SignedToken = { token: string; expiresAt: string };

export const sessionTokenLifetimeMs = 2 * 60 * 60_000;
export const patientTokenLifetimeMs = 180 * 86_400_000;

const expiryAfter = (now: Date, lifetimeMs: number): number => Math.floor((now.getTime() + lifetimeMs) / 1000);

const signClaims = async (secret: string, claims: DeviceClaims): Promise<SignedToken> => ({
  token: await sign(claims, secret, 'HS256'),
  expiresAt: new Date(claims.exp * 1000).toISOString(),
});

export const signSessionToken = (
  secret: string,
  { sid, pid, inst }: Pick<SessionClaims, 'sid' | 'pid' | 'inst'>,
  now: Date,
): Promise<SignedToken> =>
  signClaims(secret, { scope: 'session', sid, pid, inst, exp: expiryAfter(now, sessionTokenLifetimeMs) });

export const signPatientToken = (
  secret: string,
  { pid, inst, did }: Pick<PatientClaims, 'pid' | 'inst' | 'did'>,
  now: Date,
): Promise<SignedToken> =>
  signClaims(secret, { scope: 'patient', pid, inst, did, exp: expiryAfter(now, patientTokenLifetimeMs) });

export const verifyDeviceToken = async (secret: string, token: string, now: Date): Promise<DeviceClaims | undefined> => {
  let payload: unknown;
  try {
    payload = await verify(token, secret, { alg: 'HS256', exp: false, nbf: false, iat: false });
  } catch {
    return undefined;
  }
  const claims = deviceClaimsSchema.safeParse(payload);
  if (!claims.success || claims.data.exp * 1000 <= now.getTime()) return undefined;
  return claims.data;
};
