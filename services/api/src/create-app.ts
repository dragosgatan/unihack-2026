import { randomInt, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { createReportLink, recordingKey, type Ai, type RecordingWriter } from '@tempo/pipeline';
import {
  reportLinkParamsSchema,
  reportLinkPath,
  routes,
  type AssistantRole,
  type AssistantTurnRecord,
  type AuditEntry,
  type Patient,
  type RouteDefinition,
  type Session,
  type SessionPlan,
  type SessionReport,
  type Staff,
} from '@tempo/shared';
import { clinicalPatient, requireRecord, visiblePatients } from './access.ts';
import { app as baseApp } from './app.ts';
import { filterAssistantCalls, safeReply } from './assistant.ts';
import {
  signPatientToken,
  signSessionToken,
  verifyDeviceToken,
  type DeviceClaims,
} from './auth/device-tokens.ts';
import type { StaffAuth } from './auth/staff.ts';
import { planForDevice } from './device-plan.ts';
import {
  bearerToken,
  errorResponse,
  HttpError,
  internalErrorResponse,
  mountRoute,
  type RouteParts,
  type RouteResponse,
  type Via,
} from './http.ts';
import type { PipelineStarter } from './pipeline-starter.ts';
import type { PublicData } from './public-data/index.ts';
import type { ReportFileOpener } from './report-files.ts';
import { buildMetricSeries, listPatientMetrics } from './series.ts';
import { newestFirst } from './store/suggestions.ts';
import type { CodeEntry, Store } from './store/types.ts';

const codeLifetimeMs = 10 * 60_000;
const reportLinkLifetimeMs = 5 * 60_000;
const reportLinkHeaders = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };

export type AppOptions = {
  store: Store;
  staffAuth: StaffAuth;
  tokenSecret: () => Promise<string>;
  clock: () => Date;
  startPipeline: PipelineStarter;
  publicData: PublicData;
  ai: Pick<Ai, 'assistantTurn'>;
  demoSessionCodes?: ReadonlyMap<string, string>;
  reportFiles: ReportFileOpener;
  recordings: RecordingWriter;
};

type AssistantCaller = { role: AssistantRole; id: string; institutionId: string };

type AuditFields = Pick<AuditEntry, 'action' | 'entityType' | 'entityId' | 'patientId'>;

const firstName = (patient: Patient): string => patient.name.split(' ')[0] ?? patient.name;

export const createApp = ({
  store,
  staffAuth,
  tokenSecret,
  clock,
  startPipeline,
  publicData,
  ai,
  demoSessionCodes = new Map(),
  reportFiles,
  recordings,
}: AppOptions): Hono => {
  const app = new Hono();
  app.route('/', baseApp);

  const staffRoute = <Route extends RouteDefinition & { auth: 'staff' }>(
    route: Route,
    handler: (input: RouteParts<Route> & { staff: Staff; via: Via }) => Promise<RouteResponse<Route>>,
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

  const unlessUnauthenticated = async <Caller>(attempt: Promise<Caller>): Promise<Caller | undefined> => {
    try {
      return await attempt;
    } catch (error) {
      if (error instanceof HttpError && error.code === 'unauthenticated') return undefined;
      throw error;
    }
  };

  const assistantCaller = async (authorization: string | undefined): Promise<{ caller: AssistantCaller }> => {
    if (bearerToken(authorization) !== undefined) {
      const device = await unlessUnauthenticated(deviceClaims(authorization));
      if (device) return { caller: { role: 'patient', id: device.pid, institutionId: device.inst } };
      const staff = await unlessUnauthenticated(staffAuth(authorization));
      if (staff) return { caller: { role: staff.role, id: staff.id, institutionId: staff.institutionId } };
    }
    throw new HttpError('unauthenticated', 'Unknown, expired or missing token');
  };

  const audit = (staff: Staff, via: Via, fields: AuditFields): Promise<void> =>
    store.putAuditEntry({
      id: `audit-${randomUUID()}`,
      institutionId: staff.institutionId,
      actorId: staff.id,
      actorRole: staff.role,
      ...fields,
      at: clock().toISOString(),
      ...(via === undefined ? {} : { via }),
    });

  const requireHuman = (via: Via): void => {
    if (via !== undefined) throw new HttpError('forbidden', 'This has to be done by hand, not through the assistant');
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

  staffRoute(routes.createSession, async ({ staff, params, body, via }) => {
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
    await audit(staff, via, { action: 'create', entityType: 'session', entityId: session.id, patientId: patient.id });
    return { session, code, expiresAt };
  });

  staffRoute(routes.listPatientSessions, async ({ staff, params }) => {
    const { patient } = await clinicalPatient(store, staff, params.patientId);
    return { sessions: (await store.listPatientSessions(patient.id)).sort(newestFirst) };
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
    return {
      token,
      expiresAt,
      session,
      plan: planForDevice(detail.plan, detail.record, now),
      patientFirstName: firstName(detail.patient),
    };
  });

  const deviceSession = async (device: DeviceClaims, sessionId: string): Promise<Session> => {
    const session = await store.getSession(sessionId);
    if (!session) throw new HttpError('not_found', 'Session not found');
    const allowed = device.scope === 'session' ? device.sid === session.id : device.pid === session.patientId;
    if (!allowed) throw new HttpError('forbidden', 'Device token is for another session');
    return session;
  };

  const isOpen = (session: Session): boolean => session.status === 'created' || session.status === 'in-progress';

  deviceRoute(routes.uploadRecording, async ({ device, params, body }) => {
    const session = await deviceSession(device, params.sessionId);
    if (isOpen(session)) {
      await recordings.put(recordingKey(session.id, body.id), {
        mimeType: body.mimeType,
        bytes: new Uint8Array(Buffer.from(body.data, 'base64')),
      });
    }
    return { id: body.id };
  });

  deviceRoute(routes.submitSession, async ({ device, params, body }) => {
    const session = await deviceSession(device, params.sessionId);
    const status = isOpen(session)
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

  staffRoute(routes.createPairingCode, async ({ staff, params, via }) => {
    requireHuman(via);
    const { patient } = await clinicalPatient(store, staff, params.patientId);
    const now = clock();
    const expiresAt = new Date(now.getTime() + codeLifetimeMs).toISOString();
    const code = await issueCode(
      (candidate) => ({ kind: 'pairing', code: candidate, patientId: patient.id, expiresAt, used: false }),
      now,
    );
    await audit(staff, via, { action: 'create', entityType: 'pairing-code', entityId: patient.id, patientId: patient.id });
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

  staffRoute(routes.revokeDevice, async ({ staff, params, via }) => {
    requireHuman(via);
    const { patient } = await clinicalPatient(store, staff, params.patientId);
    const device = await store.getDevice(patient.id, params.deviceId);
    if (!device) throw new HttpError('not_found', 'Device not found');
    if (device.revokedAt !== undefined) return { device };
    const revoked = { ...device, revokedAt: clock().toISOString(), revokedBy: staff.id };
    await store.putDevice(revoked);
    await audit(staff, via, { action: 'update', entityType: 'device', entityId: device.id, patientId: patient.id });
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
    return { session, plan: planForDevice(detail.plan, detail.record, now) };
  });

  staffRoute(routes.lookupMedications, ({ query }) => publicData.searchMedications(query.q));

  staffRoute(routes.lookupDiagnoses, ({ query }) => publicData.searchDiagnoses(query.q));

  staffRoute(routes.listSuggestions, async ({ staff, params }) => {
    const { patient } = await clinicalPatient(store, staff, params.patientId);
    return { suggestions: await store.listSuggestions(patient.id) };
  });

  staffRoute(routes.decideSuggestion, async ({ staff, params, body, via }) => {
    requireHuman(via);
    const { patient } = await clinicalPatient(store, staff, params.patientId);
    const suggestion = await store.decideSuggestion(patient.id, params.suggestionId, {
      ...body,
      decidedBy: staff.id,
      decidedAt: clock().toISOString(),
    });
    if (!suggestion) throw new HttpError('not_found', 'Suggestion not found');
    await audit(staff, via, { action: 'update', entityType: 'suggestion', entityId: suggestion.id, patientId: patient.id });
    return { suggestion };
  });

  staffRoute(routes.listPatientFlags, async ({ staff, params }) => {
    const { patient } = await clinicalPatient(store, staff, params.patientId);
    return { flags: await store.listPatientFlags(patient.id) };
  });

  mountRoute(app, routes.assistantTurn, assistantCaller, async ({ caller, body }) => {
    const turnId = `turn-${randomUUID()}`;
    const input =
      'audio' in body
        ? { audio: { mimeType: body.audio.mimeType, data: new Uint8Array(Buffer.from(body.audio.data, 'base64')) } }
        : { text: body.text };
    const { output, meta } = await ai
      .assistantTurn({
        language: body.language,
        screenId: body.screenId,
        availableActionIds: body.availableActionIds,
        input,
        inputRef: `assistant-turn:${turnId}`,
      })
      .catch((error: unknown) => {
        console.error('Assistant turn failed', error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error');
        throw new HttpError('internal', 'Something went wrong');
      });
    const filtered = filterAssistantCalls(output.calls, caller.role, body.availableActionIds);
    const reply = safeReply(output.reply, body.language, filtered);
    const turn: AssistantTurnRecord = {
      id: turnId,
      institutionId: caller.institutionId,
      callerRole: caller.role,
      callerId: caller.id,
      screenId: body.screenId,
      language: body.language,
      input: 'audio' in body ? 'audio' : 'text',
      transcript: output.transcript,
      reply,
      model: meta.model,
      promptVersion: meta.promptVersion,
      inputRef: meta.inputRef,
      provider: meta.provider,
      keptActions: filtered.kept,
      droppedActions: filtered.dropped,
      createdAt: clock().toISOString(),
    };
    await store.putAssistantTurn(turn);
    return {
      turnId,
      transcript: output.transcript,
      reply,
      actions: filtered.kept,
      droppedActionIds: filtered.dropped.map((dropped) => dropped.id),
    };
  });

  const sessionReport = async (staff: Staff, sessionId: string): Promise<SessionReport> => {
    const session = await store.getSession(sessionId);
    if (!session) throw new HttpError('not_found', 'Session not found');
    await clinicalPatient(store, staff, session.patientId);
    const report = await store.getReport(session.id);
    if (!report) throw new HttpError('not_found', 'Report not found');
    return report;
  };

  staffRoute(routes.getSessionReport, async ({ staff, params }) => sessionReport(staff, params.sessionId));

  staffRoute(routes.createReportLink, async ({ staff, params }) => {
    const report = await sessionReport(staff, params.sessionId);
    if (!report.pdfKey) throw new HttpError('not_found', 'Report PDF not found');
    const { url, expiresAt } = await createReportLink(store, report.sessionId, clock(), reportLinkLifetimeMs);
    return { url, expiresAt };
  });

  app.get(reportLinkPath, async (c) => {
    const params = reportLinkParamsSchema.safeParse(c.req.param());
    const link = params.success ? await store.getReportLink(params.data.token, clock()) : undefined;
    const report = link && (await store.getReport(link.sessionId));
    const file = report?.pdfKey === undefined ? undefined : await reportFiles.open(report.pdfKey);
    if (!file) {
      const missing = errorResponse('not_found', 'Report link is unknown or expired');
      for (const [name, value] of Object.entries(reportLinkHeaders)) missing.headers.set(name, value);
      return missing;
    }
    if (file.kind === 'redirect') {
      return new Response(null, { status: 302, headers: { ...reportLinkHeaders, location: file.url } });
    }
    return new Response(file.bytes, {
      status: 200,
      headers: {
        ...reportLinkHeaders,
        'content-type': 'application/pdf',
        'content-disposition': 'inline; filename="tempo-report.pdf"',
      },
    });
  });

  app.notFound(() => errorResponse('not_found', 'Route not found'));
  app.onError((error) => internalErrorResponse(error));

  return app;
};
