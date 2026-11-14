import { z } from 'zod';
import { activityIdSchema } from './activity.ts';
import { assistantTurnRequestSchema, assistantTurnResponseSchema } from './assistant.ts';
import { checkInEntrySchema, episodeSchema } from './checkin.ts';
import { idSchema, isoDateTimeSchema, languageSchema, sideSchema } from './common.ts';
import { pairedDeviceSchema, patientSchema, staffSchema } from './entities.ts';
import { flagSchema } from './flag.ts';
import { diagnosisLookupResponseSchema, lookupQuerySchema, medicationLookupResponseSchema } from './lookup.ts';
import { metricIdSchema, metricSeriesSchema } from './metrics.ts';
import { medicalRecordSchema } from './record.ts';
import {
  sessionModeSchema,
  sessionPlanSchema,
  sessionSchema,
  sessionStatusSchema,
  submittedResultSchema,
} from './session.ts';
import { suggestionSchema } from './suggestion.ts';
import { sessionReportSchema } from './report.ts';

export const sessionCodeSchema = z.string().regex(/^\d{6}$/);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
  }),
});

export const patientParamsSchema = z.object({ patientId: idSchema });
export const sessionParamsSchema = z.object({ sessionId: idSchema });
export const metricSeriesParamsSchema = z.object({ patientId: idSchema, metricId: metricIdSchema });

export const meResponseSchema = staffSchema;

export const patientSummarySchema = patientSchema.pick({
  id: true,
  name: true,
  profile: true,
  dateOfBirth: true,
  sex: true,
});

export const patientListResponseSchema = z.object({
  patients: z.array(patientSummarySchema),
});

export const patientDetailResponseSchema = z.object({
  patient: patientSchema,
  record: medicalRecordSchema,
  plan: sessionPlanSchema.nullable(),
});

export const createSessionRequestSchema = z.object({
  mode: sessionModeSchema,
});

export const createSessionResponseSchema = z.object({
  session: sessionSchema,
  code: sessionCodeSchema,
  expiresAt: isoDateTimeSchema,
});

export const patientSessionListResponseSchema = z.object({
  sessions: z.array(sessionSchema),
});

export const deviceSessionCodeRequestSchema = z.object({
  code: sessionCodeSchema,
});

export const deviceSessionCodeResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: isoDateTimeSchema,
  session: sessionSchema,
  plan: sessionPlanSchema,
  patientFirstName: z.string().min(1),
});

export const submitSessionRequestSchema = z.object({
  partial: z.boolean(),
  results: z.array(submittedResultSchema),
});

export const submitSessionResponseSchema = z.object({
  sessionId: idSchema,
  status: sessionStatusSchema,
});

export const recordingMaxBytes = 1_000_000;

export const uploadRecordingRequestSchema = z.object({
  id: idSchema,
  mimeType: z.string().regex(/^audio\//),
  data: z
    .base64()
    .min(1)
    .max(Math.ceil(recordingMaxBytes / 3) * 4),
});

export const uploadRecordingResponseSchema = z.object({
  id: idSchema,
});

export const patientMetricSchema = z.object({
  metricId: metricIdSchema,
  unit: z.string().min(1),
  lateral: z.boolean(),
  lastValue: z.number().optional(),
  lastT: isoDateTimeSchema.optional(),
});

export const patientMetricsResponseSchema = z.object({
  metrics: z.array(patientMetricSchema),
});

export const metricRangeSchema = z.enum(['W', 'M', '6M', 'Y']);

export const metricSeriesQuerySchema = z.object({
  range: metricRangeSchema.optional(),
  side: sideSchema.optional(),
});

export const metricSeriesResponseSchema = metricSeriesSchema;

export const deviceParamsSchema = z.object({ patientId: idSchema, deviceId: idSchema });

export const createPairingCodeResponseSchema = z.object({
  code: sessionCodeSchema,
  expiresAt: isoDateTimeSchema,
});

export const devicePairingCodeRequestSchema = z.object({
  code: sessionCodeSchema,
  label: pairedDeviceSchema.shape.label,
});

export const devicePairingCodeResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: isoDateTimeSchema,
  deviceId: idSchema,
  patientFirstName: z.string().min(1),
  language: languageSchema,
});

export const deviceListResponseSchema = z.object({
  devices: z.array(pairedDeviceSchema),
});

export const revokeDeviceResponseSchema = z.object({
  device: pairedDeviceSchema,
});

export const startHomeSessionResponseSchema = z.object({
  session: sessionSchema,
  plan: sessionPlanSchema,
});

export const homeDataSchema = z.object({
  plan: sessionPlanSchema.optional(),
  lastSessionAt: isoDateTimeSchema.optional(),
  checkIns: z.array(isoDateTimeSchema),
  pain: z.array(z.object({ t: isoDateTimeSchema, intensity: z.number().int().min(0).max(10) })),
  exercises: z.array(z.object({ t: isoDateTimeSchema, activityId: activityIdSchema, repetitions: z.number().int().nonnegative() })),
});

export const deviceEpisodeRequestSchema = episodeSchema.pick({
  id: true,
  type: true,
  count: true,
  occurredAt: true,
  description: true,
});

export const deviceEpisodeResponseSchema = z.object({
  episode: episodeSchema,
});

export const checkInItemSchema = z.enum(['pain', 'medication', 'episodes']);

export const checkInListQuerySchema = z.object({
  range: metricRangeSchema.optional(),
  item: checkInItemSchema.optional(),
});

export const checkInListResponseSchema = z.object({
  entries: z.array(checkInEntrySchema),
});

export const episodeListQuerySchema = z.object({
  range: metricRangeSchema.optional(),
});

export const episodeListResponseSchema = z.object({
  episodes: z.array(episodeSchema),
});

export const flagListResponseSchema = z.object({
  flags: z.array(flagSchema),
});

export const suggestionParamsSchema = z.object({ patientId: idSchema, suggestionId: idSchema });

export const suggestionListResponseSchema = z.object({
  suggestions: z.array(suggestionSchema),
});

export const suggestionDecisionRequestSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('accepted') }),
  z.object({ status: z.literal('dismissed') }),
  z.object({ status: z.literal('edited'), editedText: z.string().trim().min(1).max(2000) }),
]);

export const suggestionDecisionResponseSchema = z.object({
  suggestion: suggestionSchema,
});

export const sessionReportResponseSchema = sessionReportSchema;

export const reportLinkResponseSchema = z.object({
  url: z.string().startsWith('/api/report-links/'),
  expiresAt: isoDateTimeSchema,
});

export const reportLinkPath = '/api/report-links/:token';

export const reportLinkUrl = (token: string): string => reportLinkPath.replace(':token', encodeURIComponent(token));

export const reportLinkParamsSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

export type RouteDefinition = {
  method: 'GET' | 'POST';
  path: string;
  auth: 'staff' | 'device' | 'staff-or-device' | 'none';
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
};

export const routes = {
  me: {
    method: 'GET',
    path: '/api/me',
    auth: 'staff',
    response: meResponseSchema,
  },
  listPatients: {
    method: 'GET',
    path: '/api/patients',
    auth: 'staff',
    response: patientListResponseSchema,
  },
  getPatient: {
    method: 'GET',
    path: '/api/patients/:patientId',
    auth: 'staff',
    params: patientParamsSchema,
    response: patientDetailResponseSchema,
  },
  createSession: {
    method: 'POST',
    path: '/api/patients/:patientId/sessions',
    auth: 'staff',
    params: patientParamsSchema,
    body: createSessionRequestSchema,
    response: createSessionResponseSchema,
  },
  listPatientSessions: {
    method: 'GET',
    path: '/api/patients/:patientId/sessions',
    auth: 'staff',
    params: patientParamsSchema,
    response: patientSessionListResponseSchema,
  },
  redeemSessionCode: {
    method: 'POST',
    path: '/api/device/session-code',
    auth: 'none',
    body: deviceSessionCodeRequestSchema,
    response: deviceSessionCodeResponseSchema,
  },
  submitSession: {
    method: 'POST',
    path: '/api/sessions/:sessionId/submit',
    auth: 'device',
    params: sessionParamsSchema,
    body: submitSessionRequestSchema,
    response: submitSessionResponseSchema,
  },
  uploadRecording: {
    method: 'POST',
    path: '/api/sessions/:sessionId/recordings',
    auth: 'device',
    params: sessionParamsSchema,
    body: uploadRecordingRequestSchema,
    response: uploadRecordingResponseSchema,
  },
  listPatientMetrics: {
    method: 'GET',
    path: '/api/patients/:patientId/metrics',
    auth: 'staff',
    params: patientParamsSchema,
    response: patientMetricsResponseSchema,
  },
  getMetricSeries: {
    method: 'GET',
    path: '/api/patients/:patientId/metrics/:metricId',
    auth: 'staff',
    params: metricSeriesParamsSchema,
    query: metricSeriesQuerySchema,
    response: metricSeriesResponseSchema,
  },
  createPairingCode: {
    method: 'POST',
    path: '/api/patients/:patientId/pairing-codes',
    auth: 'staff',
    params: patientParamsSchema,
    response: createPairingCodeResponseSchema,
  },
  redeemPairingCode: {
    method: 'POST',
    path: '/api/device/pairing-code',
    auth: 'none',
    body: devicePairingCodeRequestSchema,
    response: devicePairingCodeResponseSchema,
  },
  listDevices: {
    method: 'GET',
    path: '/api/patients/:patientId/devices',
    auth: 'staff',
    params: patientParamsSchema,
    response: deviceListResponseSchema,
  },
  revokeDevice: {
    method: 'POST',
    path: '/api/patients/:patientId/devices/:deviceId/revoke',
    auth: 'staff',
    params: deviceParamsSchema,
    response: revokeDeviceResponseSchema,
  },
  startHomeSession: {
    method: 'POST',
    path: '/api/device/sessions',
    auth: 'device',
    response: startHomeSessionResponseSchema,
  },
  getDeviceHome: {
    method: 'GET',
    path: '/api/device/home',
    auth: 'device',
    response: homeDataSchema,
  },
  logDeviceEpisode: {
    method: 'POST',
    path: '/api/device/episodes',
    auth: 'device',
    body: deviceEpisodeRequestSchema,
    response: deviceEpisodeResponseSchema,
  },
  listPatientCheckIns: {
    method: 'GET',
    path: '/api/patients/:patientId/check-ins',
    auth: 'staff',
    params: patientParamsSchema,
    query: checkInListQuerySchema,
    response: checkInListResponseSchema,
  },
  listPatientEpisodes: {
    method: 'GET',
    path: '/api/patients/:patientId/episodes',
    auth: 'staff',
    params: patientParamsSchema,
    query: episodeListQuerySchema,
    response: episodeListResponseSchema,
  },
  lookupMedications: {
    method: 'GET',
    path: '/api/lookup/medications',
    auth: 'staff',
    query: lookupQuerySchema,
    response: medicationLookupResponseSchema,
  },
  lookupDiagnoses: {
    method: 'GET',
    path: '/api/lookup/diagnoses',
    auth: 'staff',
    query: lookupQuerySchema,
    response: diagnosisLookupResponseSchema,
  },
  listSuggestions: {
    method: 'GET',
    path: '/api/patients/:patientId/suggestions',
    auth: 'staff',
    params: patientParamsSchema,
    response: suggestionListResponseSchema,
  },
  decideSuggestion: {
    method: 'POST',
    path: '/api/patients/:patientId/suggestions/:suggestionId/decision',
    auth: 'staff',
    params: suggestionParamsSchema,
    body: suggestionDecisionRequestSchema,
    response: suggestionDecisionResponseSchema,
  },
  listPatientFlags: {
    method: 'GET',
    path: '/api/patients/:patientId/flags',
    auth: 'staff',
    params: patientParamsSchema,
    response: flagListResponseSchema,
  },
  assistantTurn: {
    method: 'POST',
    path: '/api/assistant/turn',
    auth: 'staff-or-device',
    body: assistantTurnRequestSchema,
    response: assistantTurnResponseSchema,
  },
  getSessionReport: {
    method: 'GET',
    path: '/api/sessions/:sessionId/report',
    auth: 'staff',
    params: sessionParamsSchema,
    response: sessionReportResponseSchema,
  },
  createReportLink: {
    method: 'POST',
    path: '/api/sessions/:sessionId/report/link',
    auth: 'staff',
    params: sessionParamsSchema,
    response: reportLinkResponseSchema,
  },
} as const satisfies Record<string, RouteDefinition>;

export type RouteName = keyof typeof routes;

export type ApiError = z.infer<typeof apiErrorSchema>;
export type PatientParams = z.infer<typeof patientParamsSchema>;
export type SessionParams = z.infer<typeof sessionParamsSchema>;
export type MetricSeriesParams = z.infer<typeof metricSeriesParamsSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type PatientSummary = z.infer<typeof patientSummarySchema>;
export type PatientListResponse = z.infer<typeof patientListResponseSchema>;
export type PatientDetailResponse = z.infer<typeof patientDetailResponseSchema>;
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;
export type PatientSessionListResponse = z.infer<typeof patientSessionListResponseSchema>;
export type DeviceSessionCodeRequest = z.infer<typeof deviceSessionCodeRequestSchema>;
export type DeviceSessionCodeResponse = z.infer<typeof deviceSessionCodeResponseSchema>;
export type SubmitSessionRequest = z.infer<typeof submitSessionRequestSchema>;
export type SubmitSessionResponse = z.infer<typeof submitSessionResponseSchema>;
export type UploadRecordingRequest = z.infer<typeof uploadRecordingRequestSchema>;
export type UploadRecordingResponse = z.infer<typeof uploadRecordingResponseSchema>;
export type PatientMetric = z.infer<typeof patientMetricSchema>;
export type PatientMetricsResponse = z.infer<typeof patientMetricsResponseSchema>;
export type MetricRange = z.infer<typeof metricRangeSchema>;
export type MetricSeriesQuery = z.infer<typeof metricSeriesQuerySchema>;
export type MetricSeriesResponse = z.infer<typeof metricSeriesResponseSchema>;
export type DeviceParams = z.infer<typeof deviceParamsSchema>;
export type CreatePairingCodeResponse = z.infer<typeof createPairingCodeResponseSchema>;
export type DevicePairingCodeRequest = z.infer<typeof devicePairingCodeRequestSchema>;
export type DevicePairingCodeResponse = z.infer<typeof devicePairingCodeResponseSchema>;
export type DeviceListResponse = z.infer<typeof deviceListResponseSchema>;
export type RevokeDeviceResponse = z.infer<typeof revokeDeviceResponseSchema>;
export type StartHomeSessionResponse = z.infer<typeof startHomeSessionResponseSchema>;
export type SuggestionParams = z.infer<typeof suggestionParamsSchema>;
export type SuggestionListResponse = z.infer<typeof suggestionListResponseSchema>;
export type SuggestionDecisionRequest = z.infer<typeof suggestionDecisionRequestSchema>;
export type SuggestionDecisionResponse = z.infer<typeof suggestionDecisionResponseSchema>;
export type HomeData = z.infer<typeof homeDataSchema>;
export type DeviceEpisodeRequest = z.infer<typeof deviceEpisodeRequestSchema>;
export type DeviceEpisodeResponse = z.infer<typeof deviceEpisodeResponseSchema>;
export type CheckInItem = z.infer<typeof checkInItemSchema>;
export type CheckInListQuery = z.infer<typeof checkInListQuerySchema>;
export type CheckInListResponse = z.infer<typeof checkInListResponseSchema>;
export type EpisodeListQuery = z.infer<typeof episodeListQuerySchema>;
export type EpisodeListResponse = z.infer<typeof episodeListResponseSchema>;
export type FlagListResponse = z.infer<typeof flagListResponseSchema>;
export type SessionReportResponse = z.infer<typeof sessionReportResponseSchema>;
export type ReportLinkResponse = z.infer<typeof reportLinkResponseSchema>;
export type ReportLinkParams = z.infer<typeof reportLinkParamsSchema>;
