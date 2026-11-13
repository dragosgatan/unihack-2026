import { z } from 'zod';
import { idSchema, isoDateTimeSchema, sideSchema } from './common.ts';
import { patientSchema, staffSchema } from './entities.ts';
import { metricIdSchema, metricSeriesSchema } from './metrics.ts';
import { medicalRecordSchema } from './record.ts';
import {
  sessionModeSchema,
  sessionPlanSchema,
  sessionSchema,
  sessionStatusSchema,
  submittedResultSchema,
} from './session.ts';

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

export const patientSummarySchema = patientSchema.pick({ id: true, name: true, profile: true, dateOfBirth: true });

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

export type RouteDefinition = {
  method: 'GET' | 'POST';
  path: string;
  auth: 'staff' | 'device' | 'none';
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
export type DeviceSessionCodeRequest = z.infer<typeof deviceSessionCodeRequestSchema>;
export type DeviceSessionCodeResponse = z.infer<typeof deviceSessionCodeResponseSchema>;
export type SubmitSessionRequest = z.infer<typeof submitSessionRequestSchema>;
export type SubmitSessionResponse = z.infer<typeof submitSessionResponseSchema>;
export type PatientMetric = z.infer<typeof patientMetricSchema>;
export type PatientMetricsResponse = z.infer<typeof patientMetricsResponseSchema>;
export type MetricRange = z.infer<typeof metricRangeSchema>;
export type MetricSeriesQuery = z.infer<typeof metricSeriesQuerySchema>;
export type MetricSeriesResponse = z.infer<typeof metricSeriesResponseSchema>;
