import { randomInt, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import {
  routes,
  type MedicalRecord,
  type RouteDefinition,
  type Session,
  type Staff,
  type SubmitSessionResponse,
} from '@tempo/shared';
import { app as baseApp } from '../app.ts';
import { clinicalPatient, resolveStaff, visiblePatients } from './access.ts';
import { bearerToken, errorResponse, HttpError, mountRoute, type RouteParts, type RouteResponse } from './http.ts';
import { buildSeed, demoSessionCodes, type Seed } from './seed/build.ts';
import { buildMetricSeries, listPatientMetrics } from './series.ts';
import { createStore, type MockStore } from './store.ts';

const codeLifetimeMs = 10 * 60_000;
const deviceTokenLifetimeMs = 2 * 60 * 60_000;

export type MockAppOptions = { clock?: () => Date; seed?: Seed };

const requireRecord = (store: MockStore, patientId: string): MedicalRecord => {
  const record = store.records.get(patientId);
  if (!record) throw new HttpError('internal', 'Patient has no medical record');
  return record;
};

const newSessionCode = (store: MockStore, now: Date): string => {
  for (;;) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const existing = store.codes.get(code);
    const live = existing !== undefined && !existing.used && existing.expiresAt > now;
    if (!demoSessionCodes.has(code) && !live) return code;
  }
};

export const createMockApp = ({ clock = () => new Date(), seed }: MockAppOptions = {}): Hono => {
  const store = createStore(seed ?? buildSeed(clock()));
  const app = new Hono();
  app.route('/', baseApp);

  const staffRoute = <Route extends RouteDefinition & { auth: 'staff' }>(
    route: Route,
    handler: (input: RouteParts<Route> & { staff: Staff }) => RouteResponse<Route>,
  ) => mountRoute(app, route, (authorization) => ({ staff: resolveStaff(store, authorization) }), handler);

  const deviceRoute = <Route extends RouteDefinition & { auth: 'device' }>(
    route: Route,
    handler: (input: RouteParts<Route> & { deviceToken: string | undefined }) => RouteResponse<Route>,
  ) => mountRoute(app, route, (authorization) => ({ deviceToken: bearerToken(authorization) }), handler);

  const openRoute = <Route extends RouteDefinition & { auth: 'none' }>(
    route: Route,
    handler: (input: RouteParts<Route>) => RouteResponse<Route>,
  ) => mountRoute(app, route, () => ({}), handler);

  staffRoute(routes.me, ({ staff }) => staff);

  staffRoute(routes.listPatients, ({ staff }) => ({
    patients: visiblePatients(store, staff).map(({ id, name, profile, dateOfBirth }) => ({
      id,
      name,
      profile,
      dateOfBirth,
    })),
  }));

  staffRoute(routes.getPatient, ({ staff, params }) => {
    const patient = clinicalPatient(store, staff, params.patientId);
    return { patient, record: requireRecord(store, patient.id), plan: store.plans.get(patient.id) ?? null };
  });

  staffRoute(routes.createSession, ({ staff, params, body }) => {
    const patient = clinicalPatient(store, staff, params.patientId);
    const plan = store.plans.get(patient.id);
    if (!plan) throw new HttpError('invalid_request', 'Patient has no session plan');
    const now = clock();
    const session: Session = {
      id: `sess-${randomUUID()}`,
      patientId: patient.id,
      planId: plan.id,
      planVersion: plan.version,
      mode: body.mode,
      status: 'created',
      partial: false,
      startedBy: staff.id,
      createdAt: now.toISOString(),
    };
    const code = newSessionCode(store, now);
    const expiresAt = new Date(now.getTime() + codeLifetimeMs);
    store.sessions.set(session.id, session);
    store.codes.set(code, { sessionId: session.id, expiresAt, used: false });
    return { session, code, expiresAt: expiresAt.toISOString() };
  });

  openRoute(routes.redeemSessionCode, ({ body }) => {
    const now = clock();
    const sessionToStart = (): Session | undefined => {
      const demoPatientId = demoSessionCodes.get(body.code);
      const demoPlan = demoPatientId === undefined ? undefined : store.plans.get(demoPatientId);
      if (demoPlan) {
        const session: Session = {
          id: `sess-${randomUUID()}`,
          patientId: demoPlan.patientId,
          planId: demoPlan.id,
          planVersion: demoPlan.version,
          mode: 'kiosk',
          status: 'created',
          partial: false,
          createdAt: now.toISOString(),
        };
        store.sessions.set(session.id, session);
        return session;
      }
      const entry = store.codes.get(body.code);
      if (!entry || entry.used || entry.expiresAt <= now) return undefined;
      entry.used = true;
      return store.sessions.get(entry.sessionId);
    };

    const created = sessionToStart();
    const plan = created && store.plans.get(created.patientId);
    const patient = created && store.patients.find((candidate) => candidate.id === created.patientId);
    if (!created || !plan || !patient) throw new HttpError('code_invalid', 'Session code is unknown, expired or used');

    const session: Session = { ...created, status: 'in-progress', startedAt: now.toISOString() };
    store.sessions.set(session.id, session);
    const token = `device-${randomUUID()}`;
    const expiresAt = new Date(now.getTime() + deviceTokenLifetimeMs);
    store.deviceTokens.set(token, { sessionId: session.id, expiresAt });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      session,
      plan,
      patientFirstName: patient.name.split(' ')[0] ?? patient.name,
    };
  });

  deviceRoute(routes.submitSession, ({ deviceToken, params, body }): SubmitSessionResponse => {
    const now = clock();
    const grant = deviceToken === undefined ? undefined : store.deviceTokens.get(deviceToken);
    if (!grant || grant.expiresAt <= now) throw new HttpError('unauthenticated', 'Unknown or missing device token');
    const session = store.sessions.get(params.sessionId);
    if (!session) throw new HttpError('not_found', 'Session not found');
    if (grant.sessionId !== session.id) throw new HttpError('forbidden', 'Device token is for another session');
    if (session.status === 'submitted' || session.status === 'processed') {
      return { sessionId: session.id, status: session.status };
    }
    store.results.set(session.id, body.results);
    store.sessions.set(session.id, {
      ...session,
      status: 'submitted',
      partial: body.partial,
      submittedAt: now.toISOString(),
    });
    return { sessionId: session.id, status: 'submitted' };
  });

  staffRoute(routes.listPatientMetrics, ({ staff, params }) => {
    const patient = clinicalPatient(store, staff, params.patientId);
    return { metrics: listPatientMetrics(store, requireRecord(store, patient.id)) };
  });

  staffRoute(routes.getMetricSeries, ({ staff, params, query }) => {
    const patient = clinicalPatient(store, staff, params.patientId);
    return buildMetricSeries(store, {
      record: requireRecord(store, patient.id),
      metricId: params.metricId,
      range: query.range ?? '6M',
      side: query.side,
      now: clock(),
    });
  });

  app.notFound(() => errorResponse('not_found', 'Route not found'));
  app.onError((error) => errorResponse('internal', error.message));

  return app;
};
