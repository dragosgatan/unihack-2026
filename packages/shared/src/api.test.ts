import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  createSessionRequestSchema,
  createSessionResponseSchema,
  deviceSessionCodeRequestSchema,
  deviceSessionCodeResponseSchema,
  meResponseSchema,
  metricSeriesParamsSchema,
  metricSeriesQuerySchema,
  metricSeriesResponseSchema,
  patientDetailResponseSchema,
  patientListResponseSchema,
  patientMetricsResponseSchema,
  patientParamsSchema,
  routes,
  sessionCodeSchema,
  sessionParamsSchema,
  submitSessionRequestSchema,
  submitSessionResponseSchema,
} from './api.ts';
import {
  attending,
  fingerTappingResult,
  medicalRecord,
  patient,
  session,
  sessionPlan,
  tapsPerSecondSeries,
} from './test-fixtures.ts';

describe('sessionCodeSchema', () => {
  it('accepts six digits', () => {
    expect(sessionCodeSchema.safeParse('042917').success).toBe(true);
  });

  it('rejects five digits or letters', () => {
    expect(sessionCodeSchema.safeParse('42917').success).toBe(false);
    expect(sessionCodeSchema.safeParse('04291a').success).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it('accepts an error body', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'not-found', message: 'Patient not found' } }).success).toBe(true);
  });
});

describe('path params', () => {
  it('accepts patient, session and metric params', () => {
    expect(patientParamsSchema.safeParse({ patientId: patient.id }).success).toBe(true);
    expect(sessionParamsSchema.safeParse({ sessionId: session.id }).success).toBe(true);
    expect(
      metricSeriesParamsSchema.safeParse({ patientId: patient.id, metricId: 'finger-tapping.taps-per-second' }).success,
    ).toBe(true);
  });
});

describe('GET /api/me', () => {
  it('returns the staff member', () => {
    expect(meResponseSchema.safeParse(attending).success).toBe(true);
  });
});

describe('GET /api/patients', () => {
  it('returns patient summaries', () => {
    const { id, name, profile, dateOfBirth } = patient;
    expect(patientListResponseSchema.safeParse({ patients: [{ id, name, profile, dateOfBirth }] }).success).toBe(true);
  });
});

describe('GET /api/patients/:patientId', () => {
  it('returns patient, record and plan', () => {
    expect(patientDetailResponseSchema.safeParse({ patient, record: medicalRecord, plan: sessionPlan }).success).toBe(true);
  });

  it('allows a patient without a plan', () => {
    expect(patientDetailResponseSchema.safeParse({ patient, record: medicalRecord, plan: null }).success).toBe(true);
  });
});

describe('POST /api/patients/:patientId/sessions', () => {
  it('takes a mode', () => {
    expect(createSessionRequestSchema.safeParse({ mode: 'kiosk' }).success).toBe(true);
  });

  it('returns the session with a code', () => {
    const response = { session, code: '042917', expiresAt: '2026-11-13T10:15:00.000Z' };
    expect(createSessionResponseSchema.safeParse(response).success).toBe(true);
  });
});

describe('POST /api/device/session-code', () => {
  it('takes a code', () => {
    expect(deviceSessionCodeRequestSchema.safeParse({ code: '042917' }).success).toBe(true);
  });

  it('returns what the device needs to run the session', () => {
    const response = {
      token: 'device-token-abc',
      expiresAt: '2026-11-13T11:00:00.000Z',
      session,
      plan: sessionPlan,
      patientFirstName: 'Elena',
    };
    expect(deviceSessionCodeResponseSchema.safeParse(response).success).toBe(true);
  });
});

describe('POST /api/sessions/:sessionId/submit', () => {
  it('takes raw results', () => {
    const body = { partial: false, results: [{ raw: fingerTappingResult, completedAt: '2026-11-13T10:05:00.000Z' }] };
    expect(submitSessionRequestSchema.safeParse(body).success).toBe(true);
  });

  it('returns the new status', () => {
    expect(submitSessionResponseSchema.safeParse({ sessionId: session.id, status: 'submitted' }).success).toBe(true);
  });
});

describe('GET /api/patients/:patientId/metrics', () => {
  it('lists available series', () => {
    const response = {
      metrics: [
        { metricId: 'finger-tapping.taps-per-second', unit: 'taps/s', lateral: true, lastValue: 4.4, lastT: '2026-11-13T10:20:00.000Z' },
        { metricId: 'pain.intensity', unit: '0-10', lateral: false },
      ],
    };
    expect(patientMetricsResponseSchema.safeParse(response).success).toBe(true);
  });
});

describe('GET /api/patients/:patientId/metrics/:metricId', () => {
  it('takes an optional range and side', () => {
    expect(metricSeriesQuerySchema.safeParse({ range: '6M', side: 'left' }).success).toBe(true);
    expect(metricSeriesQuerySchema.safeParse({}).success).toBe(true);
  });

  it('returns a metric series', () => {
    expect(metricSeriesResponseSchema.safeParse(tapsPerSecondSeries).success).toBe(true);
  });
});

describe('routes', () => {
  it('has a unique method and path per route', () => {
    const keys = Object.values(routes).map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
