import { randomInt, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import {
  routes,
  type Patient,
  type RouteDefinition,
  type Session,
  type SessionPlan,
  type Staff,
} from '@tempo/shared';
import { clinicalPatient, requireRecord, visiblePatients } from './access.ts';
import { app as baseApp } from './app.ts';
import {
  signPatientToken,
  signSessionToken,
  verifyDeviceToken,
  type DeviceClaims,
} from './auth/device-tokens.ts';
import type { StaffAuth } from './auth/staff.ts';
import {
  bearerToken,
  errorResponse,
  HttpError,
  internalErrorResponse,
  mountRoute,
  type RouteParts,
  type RouteResponse,
} from './http.ts';
import type { PipelineStarter } from './pipeline-starter.ts';
import { buildMetricSeries, listPatientMetrics } from './series.ts';
import type { CodeEntry, Store } from './store/types.ts';

const codeLifetimeMs = 10 * 60_000;

export type AppOptions = {
  store: Store;
  staffAuth: StaffAuth;
  tokenSecret: () => Promise<string>;
  clock: () => Date;
  startPipeline: PipelineStarter;
  demoSessionCodes?: ReadonlyMap<string, string>;
};

const firstName = (patient: Patient): string => patient.name.split(' ')[0] ?? patient.name;

export const createApp = ({
  store,
  staffAuth,
  tokenSecret,
  clock,
  startPipeline,
  demoSessionCodes = new Map(),
}: AppOptions): Hono => {
  const app = new Hono();
  app.route('/', baseApp);

  const staffRoute = <Route extends RouteDefinition & { auth: 'staff' }>(
    route: Route,
    handler: (input: RouteParts<Route> & { staff: Staff }) => Promise<RouteResponse<Route>>,
  ) => mountRoute(app, route, async (authorization) => ({ staff: await staffAuth(authorization) }), handler);

  const deviceRoute = <Route extends RouteDefinition & { auth: 'device' }>(
    route: Route,
    handler: (input: RouteParts<Route> & { device: DeviceClaims }) => Promise<RouteResponse<Route>>,
  ) => mountRoute(app, route, async (authorization) => ({ device: await deviceClaims(authorization) }), handler);

  const openRoute = <Route extends RouteDefinition & { auth: 'none' }>(
    route: Route,
    handler: (input: RouteParts<Route>) => Promise<RouteResponse<Route>>,
  ) => mountRoute(app, route, () => ({}), handler);

  const deviceClaims = async (authorization: string | undefined): Promise<DeviceClaims> => {
    const token = bearerToken(authorization);
    const claims = token === undefined ? undefined : await verifyDeviceToken(await tokenSecret(), token, clock());
    if (!claims) throw new HttpError('unauthenticated', 'Unknown, expired or missing device token');
    if (claims.scope === 'patient') {
      const device = await store.getDevice(claims.pid, claims.did);
      if (!device || device.revokedAt !== undefined) throw new HttpError('unauthenticated', 'Device is not paired');
    }
    return claims;
  };

  const issueCode = async (entry: (code: string) => CodeEntry, now: Date): Promise<string> => {
    for (;;) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      if (!demoSessionCodes.has(code) && (await store.createCode(entry(code), now))) return code;
    }
  };

  const newSession = (patient: Patient, plan: SessionPlan, fields: Pick<Session, 'mode' | 'startedBy'>, now: Date) => ({
    id: `sess-${randomUUID()}`,
    patientId: patient.id,
    planId: plan.id,
    planVersion: plan.version,
    partial: false,
    createdAt: now.toISOString(),
    ...fields,
  });

  staffRoute(routes.me, async ({ staff }) => staff);

  staffRoute(routes.listPatients, async ({ staff }) => ({
    patients: (await visiblePatients(store, staff)).map(({ id, name, profile, dateOfBirth, sex }) => ({
      id,
      name,
      profile,
      dateOfBirth,
      sex,
    })),
  }));

  staffRoute(routes.getPatient, async ({ staff, params }) => {
    const detail = await clinicalPatient(store, staff, params.patientId);
    return { patient: detail.patient, record: requireRecord(detail), plan: detail.plan ?? null };
  });

  staffRoute(routes.createSession, async ({ staff, params, body }) => {
    const { patient, plan } = await clinicalPatient(store, staff, params.patientId);
    if (!plan) throw new HttpError('invalid_request', 'Patient has no session plan');
    const now = clock();
    const session: Session = {
      ...newSession(patient, plan, { mode: body.mode, startedBy: staff.id }, now),
      status: 'created',
    };
    const expiresAt = new Date(now.getTime() + codeLifetimeMs).toISOString();
    await store.putSession(session);
    const code = await issueCode(
      (candidate) => ({ kind: 'session', code: candidate, sessionId: session.id, expiresAt, used: false }),
      now,
    );
    return { session, code, expiresAt };
  });

  openRoute(routes.redeemSessionCode, async ({ body }) => {
    const now = clock();
    const sessionToStart = async (): Promise<Session | undefined> => {
      const demoPatientId = demoSessionCodes.get(body.code);
      if (demoPatientId !== undefined) {
        const demo = await store.getPatientDetail(demoPatientId);
        return demo?.plan && { ...newSession(demo.patient, demo.plan, { mode: 'kiosk' }, now), status: 'created' };
      }
      const grant = await store.redeemCode(body.code, 'session', now);
      return grant?.kind === 'session' ? store.getSession(grant.sessionId) : undefined;
    };

    const created = await sessionToStart();
    const detail = created && (await store.getPatientDetail(created.patientId));
    if (!created || !detail?.plan) throw new HttpError('code_invalid', 'Session code is unknown, expired or used');

    const session: Session = { ...created, status: 'in-progress', startedAt: now.toISOString() };
    await store.putSession(session);
    const { token, expiresAt } = await signSessionToken(
      await tokenSecret(),
      { sid: session.id, pid: detail.patient.id, inst: detail.patient.institutionId },
      now,
    );
    return { token, expiresAt, session, plan: detail.plan, patientFirstName: firstName(detail.patient) };
  });

  deviceRoute(routes.submitSession, async ({ device, params, body }) => {
    const session = await store.getSession(params.sessionId);
    if (!session) throw new HttpError('not_found', 'Session not found');
    const allowed = device.scope === 'session' ? device.sid === session.id : device.pid === session.patientId;
    if (!allowed) throw new HttpError('forbidden', 'Device token is for another session');
    const status =
      session.status === 'created' || session.status === 'in-progress'
        ? await store.submitSession(session, {
            partial: body.partial,
            submittedAt: clock().toISOString(),
            results: body.results,
          })
        : session.status;
    if (status === 'submitted') {
      try {
        await startPipeline(session.id);
      } catch (error) {
        console.error(`Could not start the pipeline for session ${session.id}`, error);
      }
    }
    return { sessionId: session.id, status };
  });

  staffRoute(routes.listPatientMetrics, async ({ staff, params }) => {
    const detail = await clinicalPatient(store, staff, params.patientId);
    return { metrics: await listPatientMetrics(store, requireRecord(detail)) };
  });

  staffRoute(routes.getMetricSeries, async ({ staff, params, query }) => {
    const detail = await clinicalPatient(store, staff, params.patientId);
    return buildMetricSeries(store, {
      record: requireRecord(detail),
      metricId: params.metricId,
      range: query.range ?? '6M',
      side: query.side,
      now: clock(),
    });
  });

  staffRoute(routes.createPairingCode, async ({ staff, params }) => {
    const { patient } = await clinicalPatient(store, staff, params.patientId);
    const now = clock();
    const expiresAt = new Date(now.getTime() + codeLifetimeMs).toISOString();
    const code = await issueCode(
      (candidate) => ({ kind: 'pairing', code: candidate, patientId: patient.id, expiresAt, used: false }),
      now,
    );
    return { code, expiresAt };
  });

  openRoute(routes.redeemPairingCode, async ({ body }) => {
    const now = clock();
    const grant = await store.redeemCode(body.code, 'pairing', now);
    const detail = grant?.kind === 'pairing' ? await store.getPatientDetail(grant.patientId) : undefined;
    if (!detail) throw new HttpError('code_invalid', 'Pairing code is unknown, expired or used');
    const deviceId = `dev-${randomUUID()}`;
    await store.putDevice({
      id: deviceId,
      patientId: detail.patient.id,
      ...(body.label === undefined ? {} : { label: body.label }),
      pairedAt: now.toISOString(),
    });
    const { token, expiresAt } = await signPatientToken(
      await tokenSecret(),
      { pid: detail.patient.id, inst: detail.patient.institutionId, did: deviceId },
      now,
    );
    return {
      token,
      expiresAt,
      deviceId,
      patientFirstName: firstName(detail.patient),
      language: detail.plan?.language ?? 'en',
    };
  });

  staffRoute(routes.listDevices, async ({ staff, params }) => {
    const { patient } = await clinicalPatient(store, staff, params.patientId);
    return { devices: await store.listDevices(patient.id) };
  });

  staffRoute(routes.revokeDevice, async ({ staff, params }) => {
    const { patient } = await clinicalPatient(store, staff, params.patientId);
    const device = await store.getDevice(patient.id, params.deviceId);
    if (!device) throw new HttpError('not_found', 'Device not found');
    if (device.revokedAt !== undefined) return { device };
    const revoked = { ...device, revokedAt: clock().toISOString(), revokedBy: staff.id };
    await store.putDevice(revoked);
    return { device: revoked };
  });

  deviceRoute(routes.startHomeSession, async ({ device }) => {
    if (device.scope !== 'patient') throw new HttpError('forbidden', 'Only a paired device can start a home session');
    const detail = await store.getPatientDetail(device.pid);
    if (!detail) throw new HttpError('not_found', 'Patient not found');
    if (!detail.plan) throw new HttpError('invalid_request', 'Patient has no session plan');
    const now = clock();
    const session: Session = {
      ...newSession(detail.patient, detail.plan, { mode: 'home' }, now),
      status: 'in-progress',
      startedAt: now.toISOString(),
    };
    await store.putSession(session);
    return { session, plan: detail.plan };
  });

  app.notFound(() => errorResponse('not_found', 'Route not found'));
  app.onError((error) => internalErrorResponse(error));

  return app;
};
