import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  createSessionRequestSchema,
  createPairingCodeResponseSchema,
  createSessionResponseSchema,
  deviceListResponseSchema,
  deviceParamsSchema,
  devicePairingCodeRequestSchema,
  devicePairingCodeResponseSchema,
  deviceSessionCodeRequestSchema,
  deviceSessionCodeResponseSchema,
  flagListResponseSchema,
  meResponseSchema,
  metricSeriesParamsSchema,
  metricSeriesQuerySchema,
  metricSeriesResponseSchema,
  patientDetailResponseSchema,
  patientListResponseSchema,
  patientMetricsResponseSchema,
  patientParamsSchema,
  patientSessionListResponseSchema,
  reportLinkParamsSchema,
  reportLinkResponseSchema,
  reportLinkUrl,
  revokeDeviceResponseSchema,
  routes,
  sessionCodeSchema,
  sessionParamsSchema,
  sessionReportResponseSchema,
  startHomeSessionResponseSchema,
  submitSessionRequestSchema,
  submitSessionResponseSchema,
  uploadRecordingRequestSchema,
  uploadRecordingResponseSchema,
} from './api.ts';
import {
  attending,
  fingerTappingResult,
  medicalRecord,
  pairedDevice,
  painSkip,
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
    const { id, name, profile, dateOfBirth, sex } = patient;
    const summary = { id, name, profile, dateOfBirth, sex };
    expect(patientListResponseSchema.safeParse({ patients: [summary] }).success).toBe(true);
    expect(patientListResponseSchema.safeParse({ patients: [{ id, name, profile, dateOfBirth }] }).success).toBe(false);
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

describe('GET /api/patients/:patientId/sessions', () => {
  it('lists the patient’s sessions', () => {
    const submitted = { ...session, id: 'sess-2', status: 'submitted', submittedAt: '2026-11-13T10:30:00.000Z' };
    expect(patientSessionListResponseSchema.safeParse({ sessions: [submitted, session] }).success).toBe(true);
    expect(patientSessionListResponseSchema.safeParse({ sessions: [{ ...session, status: 'done' }] }).success).toBe(false);
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
  it('takes completed and skipped results', () => {
    const completed = { status: 'completed', raw: fingerTappingResult, completedAt: '2026-11-13T10:05:00.000Z' };
    const body = { partial: false, results: [completed, painSkip] };
    expect(submitSessionRequestSchema.safeParse(body).success).toBe(true);
  });

  it('returns the new status', () => {
    expect(submitSessionResponseSchema.safeParse({ sessionId: session.id, status: 'submitted' }).success).toBe(true);
  });
});

describe('POST /api/sessions/:sessionId/recordings', () => {
  const body = { id: '0b6c2f1e-8a43-4f3e-9d61-2c7d5b8e4a10', mimeType: 'audio/webm;codecs=opus', data: 'YXVkaW8=' };

  it('takes an audio recording as base64 under its device id', () => {
    expect(uploadRecordingRequestSchema.safeParse(body).success).toBe(true);
    expect(uploadRecordingRequestSchema.safeParse({ ...body, mimeType: 'audio/mp4' }).success).toBe(true);
    expect(uploadRecordingResponseSchema.safeParse({ id: body.id }).success).toBe(true);
  });

  it('rejects other media, bad or empty base64 and recordings over about a megabyte', () => {
    expect(uploadRecordingRequestSchema.safeParse({ ...body, mimeType: 'video/webm' }).success).toBe(false);
    expect(uploadRecordingRequestSchema.safeParse({ ...body, data: 'not base64!' }).success).toBe(false);
    expect(uploadRecordingRequestSchema.safeParse({ ...body, data: '' }).success).toBe(false);
    expect(uploadRecordingRequestSchema.safeParse({ ...body, id: '' }).success).toBe(false);
    const tooBig = 'A'.repeat(1_333_340);
    expect(uploadRecordingRequestSchema.safeParse({ ...body, data: tooBig }).success).toBe(false);
    const largest = 'A'.repeat(1_333_336);
    expect(uploadRecordingRequestSchema.safeParse({ ...body, data: largest }).success).toBe(true);
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

describe('POST /api/patients/:patientId/pairing-codes', () => {
  it('returns a code with its expiry', () => {
    const response = { code: '583104', expiresAt: '2026-11-13T10:40:00.000Z' };
    expect(createPairingCodeResponseSchema.safeParse(response).success).toBe(true);
  });
});

describe('POST /api/device/pairing-code', () => {
  it('takes a code and an optional label', () => {
    expect(devicePairingCodeRequestSchema.safeParse({ code: '583104' }).success).toBe(true);
    expect(devicePairingCodeRequestSchema.safeParse({ code: '583104', label: "Elena's phone" }).success).toBe(true);
  });

  it('returns a long-lived token for the patient', () => {
    const response = {
      token: 'patient-token-abc',
      expiresAt: '2027-05-12T10:30:00.000Z',
      deviceId: pairedDevice.id,
      patientFirstName: 'Elena',
      language: 'ro',
    };
    expect(devicePairingCodeResponseSchema.safeParse(response).success).toBe(true);
  });
});

describe('GET /api/patients/:patientId/devices', () => {
  it('lists paired devices', () => {
    expect(deviceListResponseSchema.safeParse({ devices: [pairedDevice] }).success).toBe(true);
  });
});

describe('POST /api/patients/:patientId/devices/:deviceId/revoke', () => {
  it('takes patient and device params', () => {
    expect(deviceParamsSchema.safeParse({ patientId: patient.id, deviceId: pairedDevice.id }).success).toBe(true);
  });

  it('returns the revoked device', () => {
    const device = { ...pairedDevice, revokedAt: '2026-11-14T09:00:00.000Z', revokedBy: attending.id };
    expect(revokeDeviceResponseSchema.safeParse({ device }).success).toBe(true);
  });
});

describe('POST /api/device/sessions', () => {
  it('returns the home session with its plan', () => {
    const response = { session: { ...session, mode: 'home', status: 'in-progress' }, plan: sessionPlan };
    expect(startHomeSessionResponseSchema.safeParse(response).success).toBe(true);
  });
});

describe('GET /api/patients/:patientId/flags', () => {
  it('lists flags of every kind', () => {
    const base = { patientId: patient.id, sessionId: session.id, createdAt: '2026-11-13T10:40:00.000Z' };
    const flags = [
      { ...base, id: 'flag-1', kind: 'reliable-change', metricId: 'finger-tapping.taps-per-second', side: 'right', value: 2.1, baseline: 4.1 },
      { ...base, id: 'flag-2', kind: 'pain-skip', activityId: 'shoulder-raise', stage: 'task' },
      { ...base, id: 'flag-3', kind: 'repeated-skip', activityId: 'shoulder-raise', previousSessionId: 'sess-0', reason: 'pain' },
    ];
    expect(flagListResponseSchema.safeParse({ flags }).success).toBe(true);
    expect(flagListResponseSchema.safeParse({ flags: [{ ...base, id: 'flag-4', kind: 'bad-day' }] }).success).toBe(false);
  });
});

describe('GET /api/sessions/:sessionId/report', () => {
  it('returns the stored report with its optional PDF key', () => {
    const report = {
      sessionId: session.id,
      patientId: patient.id,
      generatedAt: '2026-11-13T10:30:00.000Z',
      skipped: [],
      scores: [],
      aiItems: [],
      aiSummary: {
        label: 'ai-generated',
        summary: 'All scores were within the own range.',
        claims: [],
        ai: {
          model: 'stub',
          promptVersion: 'session-summary@1',
          inputRef: `session:${session.id}`,
          provider: 'mock',
          createdAt: '2026-11-13T10:30:00.000Z',
        },
      },
    };
    expect(sessionReportResponseSchema.safeParse(report).success).toBe(true);
    const withPdf = { ...report, pdfKey: `reports/${patient.id}/${session.id}.pdf` };
    expect(sessionReportResponseSchema.parse(withPdf).pdfKey).toBe(withPdf.pdfKey);
    expect(sessionReportResponseSchema.safeParse({ ...report, pdfKey: '' }).success).toBe(false);
  });
});

describe('POST /api/sessions/:sessionId/report/link', () => {
  const token = 'A'.repeat(42) + '_';

  it('returns a relative report link with its expiry', () => {
    const response = { url: reportLinkUrl(token), expiresAt: '2026-11-13T10:35:00.000Z' };
    expect(response.url).toBe(`/api/report-links/${token}`);
    expect(reportLinkResponseSchema.safeParse(response).success).toBe(true);
    expect(reportLinkResponseSchema.safeParse({ ...response, url: 'https://elsewhere.test/x' }).success).toBe(false);
  });

  it('only accepts a 32-byte base64url token in the link', () => {
    expect(reportLinkParamsSchema.safeParse({ token }).success).toBe(true);
    expect(reportLinkParamsSchema.safeParse({ token: token.slice(1) }).success).toBe(false);
    expect(reportLinkParamsSchema.safeParse({ token: `${token.slice(1)}=` }).success).toBe(false);
  });
});

describe('routes', () => {
  it('has a unique method and path per route', () => {
    const keys = Object.values(routes).map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
