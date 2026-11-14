import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { activityIds, metricDefinitions, metricIds, type MeResponse, type MetricSeries, type PatientDetailResponse, type PatientListResponse, type PatientMetricsResponse } from '@tempo/shared';
import { attending, medicalRecord, patient, tapsPerSecondSeries } from '../../../../packages/shared/src/test-fixtures.ts';
import { routes } from '../routes.tsx';
import { aboutTests } from './aboutTests.ts';
import { getToken, setToken } from './auth.ts';
import { metricDomains } from './domains.ts';
import { metricNames } from './metricNames.ts';

configure({ asyncUtilTimeout: 5000 });

class StubIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const me: MeResponse = attending;

const patientList: PatientListResponse = {
  patients: [
    { id: patient.id, name: patient.name, profile: patient.profile, dateOfBirth: patient.dateOfBirth, sex: patient.sex },
    { id: 'pat-2', name: 'Ștefan Mureșan', profile: 'neurological', dateOfBirth: '1948-02-11', sex: 'male' },
    { id: 'pat-3', name: 'Andrei Popa', profile: 'sports', dateOfBirth: '2001-07-30', sex: 'male' },
  ],
};

const patientDetail: PatientDetailResponse = { patient, record: medicalRecord, plan: null };

const patientMetrics: PatientMetricsResponse = {
  metrics: [
    { metricId: 'finger-tapping.taps-per-second', unit: 'taps/s', lateral: true, lastValue: 4.2, lastT: '2026-10-12T09:00:00.000Z' },
    { metricId: 'pain.intensity', unit: '0-10', lateral: false },
  ],
};

type Handler = (authorization: string | null) => Response;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const unauthenticated = () => json({ error: { code: 'unauthenticated', message: 'Unknown or missing staff token' } }, 401);

function stubApi(overrides: Record<string, Handler> = {}) {
  const handlers: Record<string, Handler> = {
    '/api/me': () => json(me),
    '/api/patients': () => json(patientList),
    [`/api/patients/${patient.id}`]: () => json(patientDetail),
    [`/api/patients/${patient.id}/metrics`]: () => json(patientMetrics),
    ...overrides,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const authorization = new Headers(init?.headers).get('Authorization');
    const handler = handlers[url] ?? handlers[url.split('?')[0] ?? url];
    return handler ? handler(authorization) : json({ error: { code: 'not_found', message: 'Not found' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', StubIntersectionObserver);
  localStorage.clear();
  setToken(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('clinician sign-in', () => {
  it('sends a visitor without a token to the sign-in screen', async () => {
    stubApi();
    const router = renderAt('/clinician/patients');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/clinician/login');
  });

  it('signs in as the attending and greets them by the name from /api/me', async () => {
    const fetchMock = stubApi();
    renderAt('/clinician/login');
    fireEvent.click(await screen.findByRole('button', { name: /Attending physician/ }));

    expect(await screen.findByText(`Hello, ${attending.name}.`)).toBeTruthy();
    expect(getToken()).toBe('mock-attending');
    expect(localStorage.getItem('tempo.clinician.token')).toBe('mock-attending');
    const sentAuth = fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get('Authorization'));
    expect(sentAuth).toContain('Bearer mock-attending');
  });

  it('returns to sign-in when the API answers 401', async () => {
    stubApi({ '/api/me': unauthenticated });
    setToken('mock-expired');
    const router = renderAt('/clinician');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/clinician/login');
    expect(getToken()).toBeNull();
  });
});

describe('clinician screens', () => {
  beforeEach(() => {
    setToken('mock-attending');
  });

  it('filters patients by name ignoring diacritics', async () => {
    stubApi();
    renderAt('/clinician/patients');
    expect(await screen.findByRole('link', { name: /Elena Dorian/ })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'stefan' } });

    expect(screen.getByRole('link', { name: /Ștefan Mureșan/ }).textContent).toContain('years · Male');
    expect(screen.queryByRole('link', { name: /Elena Dorian/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Andrei Popa/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zzz' } });
    expect(screen.getByText('No patients match')).toBeTruthy();
  });

  it('shows the patient name as the title and a pinned card per metric', async () => {
    stubApi();
    renderAt(`/clinician/patients/${patient.id}`);

    expect(await screen.findByRole('heading', { level: 1, name: patient.name })).toBeTruthy();
    const pinned = (await screen.findByRole('heading', { level: 2, name: 'Pinned' })).closest('section');
    if (!pinned) throw new Error('Pinned section missing');
    const tapping = await within(pinned).findByRole('link', { name: new RegExp(metricNames['finger-tapping.taps-per-second']) });
    expect(tapping.getAttribute('href')).toBe(`/clinician/patients/${patient.id}/metrics/finger-tapping.taps-per-second`);
    expect(within(pinned).getByRole('link', { name: new RegExp(metricNames['pain.intensity']) }).textContent).toContain('No data yet');
  });

  it('shows Try again when the patient list fails and refetches on tap', async () => {
    let calls = 0;
    stubApi({ '/api/patients': () => (++calls === 1 ? json({ error: { code: 'internal', message: 'Boom' } }, 500) : json(patientList)) });
    renderAt('/clinician/patients');

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /Elena Dorian/ })).toBeTruthy());
  });
});

const tappingPath = `/api/patients/${patient.id}/metrics/finger-tapping.taps-per-second`;
const painPath = `/api/patients/${patient.id}/metrics/pain.intensity`;
const tappingName = metricNames['finger-tapping.taps-per-second'];

function seriesCalls(fetchMock: ReturnType<typeof stubApi>, path: string): URLSearchParams[] {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith(`${path}?`))
    .map((url) => new URLSearchParams(url.slice(url.indexOf('?') + 1)));
}

function sessionsSection(): HTMLElement {
  const section = screen.getByRole('heading', { level: 2, name: 'Sessions' }).closest('section');
  if (!section) throw new Error('Sessions section missing');
  return section;
}

describe('metric detail', () => {
  beforeEach(() => {
    setToken('mock-attending');
  });

  it('opens from a pinned card and shows the chart, About this test and back to the patient', async () => {
    stubApi({ [tappingPath]: () => json(tapsPerSecondSeries) });
    const router = renderAt(`/clinician/patients/${patient.id}`);

    const pinned = (await screen.findByRole('heading', { level: 2, name: 'Pinned' })).closest('section');
    if (!pinned) throw new Error('Pinned section missing');
    fireEvent.click(await within(pinned).findByRole('link', { name: new RegExp(tappingName) }));

    expect(await screen.findByRole('heading', { level: 1, name: tappingName })).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/clinician/patients/${patient.id}/metrics/finger-tapping.taps-per-second`);
    expect(await screen.findByRole('heading', { level: 3, name: tappingName })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'About this test' })).toBeTruthy();
    expect(screen.getByText('Higher values mean faster tapping.')).toBeTruthy();
    expect((await screen.findByRole('link', { name: patient.name })).getAttribute('href')).toBe(`/clinician/patients/${patient.id}`);
  });

  it('requests the chosen range and keeps it in the URL', async () => {
    const fetchMock = stubApi({ [tappingPath]: () => json(tapsPerSecondSeries) });
    const router = renderAt(`/clinician/patients/${patient.id}/metrics/finger-tapping.taps-per-second`);
    await screen.findByRole('heading', { level: 3, name: tappingName });
    expect(seriesCalls(fetchMock, tappingPath)[0]?.get('range')).toBe('M');

    fireEvent.click(screen.getByRole('radio', { name: 'W' }));

    await waitFor(() => expect(seriesCalls(fetchMock, tappingPath).some((query) => query.get('range') === 'W')).toBe(true));
    expect(new URLSearchParams(router.state.location.search).get('range')).toBe('W');
  });

  it('passes the default side for a lateral metric and switches side', async () => {
    const fetchMock = stubApi({ [tappingPath]: () => json(tapsPerSecondSeries) });
    renderAt(`/clinician/patients/${patient.id}/metrics/finger-tapping.taps-per-second`);
    await screen.findByRole('heading', { level: 3, name: tappingName });
    expect(seriesCalls(fetchMock, tappingPath)[0]?.get('side')).toBe('right');

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Side' })).getByRole('radio', { name: 'Left' }));

    await waitFor(() => expect(seriesCalls(fetchMock, tappingPath).some((query) => query.get('side') === 'left')).toBe(true));
  });

  it('sends no side and shows no side control for a non-lateral metric', async () => {
    const painSeries: MetricSeries = { metricId: 'pain.intensity', unit: '0-10', points: [{ t: '2026-11-10T10:00:00.000Z', value: 3 }], baseline: null, referenceBand: null, events: [] };
    const fetchMock = stubApi({ [painPath]: () => json(painSeries) });
    renderAt(`/clinician/patients/${patient.id}/metrics/pain.intensity`);
    await screen.findByRole('heading', { level: 3, name: metricNames['pain.intensity'] });
    expect(seriesCalls(fetchMock, painPath)[0]?.has('side')).toBe(false);
    expect(screen.queryByRole('radiogroup', { name: 'Side' })).toBeNull();
    expect(within(sessionsSection()).getByText('3 / 10')).toBeTruthy();
  });

  it('lists a skipped session with reason and stage and no value, newest first', async () => {
    stubApi({ [tappingPath]: () => json(tapsPerSecondSeries) });
    renderAt(`/clinician/patients/${patient.id}/metrics/finger-tapping.taps-per-second`);
    await screen.findByRole('heading', { level: 2, name: 'Sessions' });

    const rows = within(sessionsSection()).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['13 Nov 20264.4 taps/s', '20 Oct 2026SkippedToo tiredStopped at practice', '15 Sept 20263.9 taps/s']);
    expect(rows[1]?.textContent).not.toMatch(/taps\/s|\b0\b/);
    expect(within(sessionsSection()).queryByText('Levodopa dose increased')).toBeNull();
  });

  it('shows the empty state when the range has no sessions', async () => {
    stubApi({ [tappingPath]: () => json({ ...tapsPerSecondSeries, points: [], events: [] }) });
    renderAt(`/clinician/patients/${patient.id}/metrics/finger-tapping.taps-per-second`);

    expect(await screen.findByText('No sessions in this range')).toBeTruthy();
    expect(screen.getByText('No data in this range')).toBeTruthy();
  });

  it('shows a highlight with a sentence for a metric below its usual range, even when another series fails', async () => {
    const recent = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const lowTapping: MetricSeries = {
      ...tapsPerSecondSeries,
      points: [
        { t: recent(6), value: 3 },
        { t: recent(2), value: 3.1 },
      ],
      events: [],
    };
    stubApi({ [tappingPath]: () => json(lowTapping) });
    renderAt(`/clinician/patients/${patient.id}`);

    const section = (await screen.findByRole('heading', { level: 2, name: 'Highlights' })).closest('section');
    if (!section) throw new Error('Highlights section missing');
    const sentence = "Finger tapping speed was below the patient's usual range in the last 2 sessions.";
    const card = await within(section).findByRole('link', { name: new RegExp(sentence) });
    expect(card.getAttribute('href')).toBe(`/clinician/patients/${patient.id}/metrics/finger-tapping.taps-per-second`);
    expect(within(section).getAllByRole('link')).toHaveLength(1);
  });

  it('shows No highlights yet when nothing stands out', async () => {
    stubApi({ [tappingPath]: () => json({ ...tapsPerSecondSeries, points: [], events: [] }) });
    renderAt(`/clinician/patients/${patient.id}`);
    expect(await screen.findByText('No highlights yet')).toBeTruthy();
  });

  it('shows Try again when the series fails and refetches on tap', async () => {
    let calls = 0;
    stubApi({ [tappingPath]: () => (++calls === 1 ? json({ error: { code: 'internal', message: 'Boom' } }, 500) : json(tapsPerSecondSeries)) });
    renderAt(`/clinician/patients/${patient.id}/metrics/finger-tapping.taps-per-second`);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 3, name: tappingName })).toBeTruthy();
  });

  it('shows Metric not found for an unknown metric', async () => {
    stubApi();
    renderAt(`/clinician/patients/${patient.id}/metrics/not-a-metric`);
    expect(await screen.findByText('Metric not found')).toBeTruthy();
  });

  it('goes from Browse to a domain, a metric and a patient, and back to the picker', async () => {
    stubApi({ [tappingPath]: () => json(tapsPerSecondSeries) });
    const router = renderAt('/clinician/browse');

    fireEvent.click(await screen.findByRole('link', { name: /Motor/ }));
    fireEvent.click(await screen.findByRole('link', { name: new RegExp(tappingName) }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Choose a patient' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('link', { name: new RegExp(patient.name) }));

    expect(await screen.findByRole('heading', { level: 3, name: tappingName })).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/clinician/patients/${patient.id}/metrics/finger-tapping.taps-per-second`);
    expect(screen.getByText(patient.name)).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Choose a patient' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/clinician/browse/motor/finger-tapping.taps-per-second');
  });
});

const leftTapping: MetricSeries = {
  ...tapsPerSecondSeries,
  points: [
    { t: '2026-09-15T10:00:00.000Z', value: 5 },
    { t: '2026-11-13T10:20:00.000Z', value: 5.5 },
  ],
};

describe('left vs right', () => {
  beforeEach(() => {
    setToken('mock-attending');
  });

  it('shows both sides with the affected side first, a comparison card and paired sessions', async () => {
    const fetchMock = stubApi({
      [`${tappingPath}?range=M&side=right`]: () => json(tapsPerSecondSeries),
      [`${tappingPath}?range=M&side=left`]: () => json(leftTapping),
    });
    renderAt(`/clinician/patients/${patient.id}/metrics/finger-tapping.taps-per-second?side=both`);

    const card = (await screen.findByRole('heading', { level: 3, name: 'Left vs right' })).parentElement?.parentElement;
    if (!card) throw new Error('Left vs right card missing');
    expect(card.textContent).toContain('Right (affected)');
    expect(card.textContent).toContain('Affected side at 80% of the other side');
    expect(within(screen.getByRole('radiogroup', { name: 'Side' })).getByRole('radio', { name: 'Both' }).getAttribute('aria-checked')).toBe('true');
    const sides = seriesCalls(fetchMock, tappingPath).map((query) => query.get('side'));
    expect(sides).toContain('right');
    expect(sides).toContain('left');
    const table = screen.getByRole('table', { name: tappingName });
    expect(Array.from(table.querySelectorAll('th')).map((cell) => cell.textContent)).toEqual(['Date', 'Right (affected)', 'Left', 'Note']);
    const rows = within(sessionsSection()).getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual(['13 Nov 2026L 5.5 taps/s · R 4.4 taps/s', '20 Oct 2026SkippedToo tiredStopped at practice', '15 Sept 2026L 5 taps/s · R 3.9 taps/s']);
  });

  it('shows the difference and no affected wording when the patient has no affected side', async () => {
    const noAffected: PatientDetailResponse = { ...patientDetail, record: { ...medicalRecord, affectedLimbs: [] } };
    stubApi({
      [`/api/patients/${patient.id}`]: () => json(noAffected),
      [`${tappingPath}?range=M&side=right`]: () => json(tapsPerSecondSeries),
      [`${tappingPath}?range=M&side=left`]: () => json(leftTapping),
    });
    renderAt(`/clinician/patients/${patient.id}/metrics/finger-tapping.taps-per-second?side=both`);

    const card = (await screen.findByRole('heading', { level: 3, name: 'Left vs right' })).parentElement?.parentElement;
    expect(card?.textContent).toContain('Difference between sides 1.1 taps/s');
    expect(card?.textContent).not.toContain('affected');
  });
});

const aclPatient = { ...patient, id: 'pat-3', name: 'Andrei Popa', profile: 'sports' as const };
const aclRecord: PatientDetailResponse['record'] = {
  ...medicalRecord,
  patientId: 'pat-3',
  affectedLimbs: [{ limb: 'leg', side: 'right', prosthesis: false }],
  injury: {
    structure: 'Anterior cruciate ligament',
    side: 'right',
    dateOfInjury: '2026-07-04',
    surgery: { date: '2026-07-20', type: 'ACL reconstruction' },
    rehabPhase: {
      name: 'Strength and neuromuscular control',
      enteredAt: '2026-10-17',
      targets: [
        { label: 'Full knee extension', met: true },
        { label: 'Single-leg squat symmetry above 90%', met: false },
      ],
    },
    phaseHistory: [
      {
        name: 'Early rehabilitation',
        enteredAt: '2026-08-08',
        completedAt: '2026-10-17',
        targets: [
          { label: 'Walking without crutches', met: true },
          { label: 'Knee flexion to 120°', met: true },
          { label: 'Straight-leg raise without lag', met: false },
        ],
        decidedBy: 'stf-2',
      },
    ],
  },
};
const aclMetrics: PatientMetricsResponse = {
  metrics: [
    { metricId: 'single-leg-squat.depth', unit: '%', lateral: true, lastValue: 52, lastT: '2026-11-11T15:00:00.000Z' },
    { metricId: 'single-leg-squat.knee-valgus', unit: '°', lateral: true, lastValue: 6, lastT: '2026-11-11T15:00:00.000Z' },
    { metricId: 'single-leg-squat.symmetry', unit: '%', lateral: false, lastValue: 85, lastT: '2026-11-11T15:00:00.000Z' },
  ],
};
const squatSeries = (metricId: MetricSeries['metricId'], unit: string, value: number): MetricSeries => ({
  metricId,
  unit,
  points: [{ t: '2026-11-11T15:00:00.000Z', value }],
  baseline: null,
  referenceBand: null,
  events: [],
});
const aclPath = '/api/patients/pat-3';

function aclApi() {
  return stubApi({
    [aclPath]: () => json({ patient: aclPatient, record: aclRecord, plan: null }),
    [`${aclPath}/metrics`]: () => json(aclMetrics),
    [`${aclPath}/metrics/single-leg-squat.depth?range=M&side=right`]: () => json(squatSeries('single-leg-squat.depth', '%', 52)),
    [`${aclPath}/metrics/single-leg-squat.depth?range=M&side=left`]: () => json(squatSeries('single-leg-squat.depth', '%', 61)),
    [`${aclPath}/metrics/single-leg-squat.knee-valgus?range=M&side=right`]: () => json(squatSeries('single-leg-squat.knee-valgus', '°', 6)),
    [`${aclPath}/metrics/single-leg-squat.knee-valgus?range=M&side=left`]: () => json(squatSeries('single-leg-squat.knee-valgus', '°', 3)),
    [`${aclPath}/metrics/single-leg-squat.symmetry?range=M`]: () => json(squatSeries('single-leg-squat.symmetry', '%', 85)),
  });
}

describe('limb symmetry', () => {
  beforeEach(() => {
    setToken('mock-attending');
  });

  it('shows the injury, the symmetry chart with its target, both sides per metric and the phase checklist', async () => {
    aclApi();
    renderAt('/clinician/patients/pat-3/symmetry');

    expect(await screen.findByRole('heading', { level: 1, name: 'Limb symmetry' })).toBeTruthy();
    expect(await screen.findByText('Right anterior cruciate ligament')).toBeTruthy();
    expect(screen.getByText('Weeks since surgery')).toBeTruthy();
    expect(screen.getByText('Strength and neuromuscular control', { selector: 'dd' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 3, name: 'Limb symmetry' })).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText('From single-leg squat symmetry')).toBeTruthy();

    const comparison = screen.getByRole('heading', { level: 2, name: 'Left vs right' }).closest('section');
    if (!comparison) throw new Error('Left vs right list missing');
    const depth = within(comparison).getByRole('link', { name: new RegExp(metricNames['single-leg-squat.depth']) });
    expect(depth.getAttribute('href')).toBe('/clinician/patients/pat-3/metrics/single-leg-squat.depth?side=both');
    expect(depth.textContent).toContain('R 52 % · L 61 %');
    expect(depth.textContent).toContain('Symmetry 85.2%');
    expect(within(comparison).getByRole('link', { name: new RegExp(metricNames['single-leg-squat.knee-valgus']) }).textContent).toContain('Difference 3 °');

    const phase = screen.getByRole('heading', { level: 3, name: 'Rehab phase' }).parentElement?.parentElement;
    expect(phase?.textContent).toContain('Full knee extensionMet');
    expect(phase?.textContent).toContain('Single-leg squat symmetry above 90%Not yet');
    expect(phase?.textContent).toContain('The therapist decides when to move to the next phase.');
    expect(phase?.querySelector('button')).toBeNull();

    const completed = screen.getByRole('heading', { level: 2, name: 'Completed phases' }).closest('section');
    expect(completed?.textContent).toContain('2 of 3 targets met');
  });

  it('links to the screen from the patient with the latest symmetry value', async () => {
    aclApi();
    renderAt('/clinician/patients/pat-3');

    const section = (await screen.findByRole('heading', { level: 2, name: 'Limb symmetry' })).closest('section');
    if (!section) throw new Error('Limb symmetry section missing');
    const card = await within(section).findByRole('link', { name: /85%/ });
    expect(card.getAttribute('href')).toBe('/clinician/patients/pat-3/symmetry');
    expect(card.textContent).toContain(metricNames['single-leg-squat.symmetry']);
  });

  it('shows an empty state for a patient with no affected side', async () => {
    stubApi({ [`/api/patients/${patient.id}`]: () => json({ ...patientDetail, record: { ...medicalRecord, affectedLimbs: [] } }) });
    renderAt(`/clinician/patients/${patient.id}/symmetry`);
    expect(await screen.findByText('No limb symmetry')).toBeTruthy();
  });
});

describe('check-in', () => {
  beforeEach(() => {
    setToken('mock-attending');
  });

  const painSeries: MetricSeries = {
    metricId: 'pain.intensity',
    unit: '0-10',
    points: [{ t: '2026-11-10T09:00:00.000Z', value: 3 }],
    baseline: null,
    referenceBand: null,
    events: [],
  };

  function checkInApi() {
    return stubApi({
      [painPath]: () => json(painSeries),
      [tappingPath]: () => json(tapsPerSecondSeries),
      [`/api/patients/${patient.id}/flags`]: () =>
        json({
          flags: [
            {
              id: 'flag-1',
              patientId: patient.id,
              sessionId: 'sess-1',
              kind: 'pain-skip',
              activityId: 'shoulder-raise',
              stage: 'task',
              painLocation: 'right-shoulder',
              createdAt: '2026-11-09T09:00:00.000Z',
            },
          ],
        }),
    });
  }

  it('shows pain with the body map, current medications, missing check-ins and a score on the default side', async () => {
    const fetchMock = checkInApi();
    renderAt(`/clinician/patients/${patient.id}/check-in`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Check-in' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 3, name: 'Pain' })).toBeTruthy();
    expect(screen.getByText('Where pain was reported when an activity was stopped')).toBeTruthy();
    expect(screen.getByText('Right shoulder')).toBeTruthy();
    expect(screen.getByText('1 time')).toBeTruthy();
    expect(screen.getByText('No medication check-ins yet')).toBeTruthy();
    expect(screen.getByText('Levodopa/Carbidopa')).toBeTruthy();
    expect(screen.getByText('No episode check-ins yet')).toBeTruthy();
    const score = screen.getByRole('combobox', { name: 'Score' });
    expect((score as HTMLSelectElement).value).toBe('finger-tapping.taps-per-second');
    expect(await screen.findByRole('heading', { level: 3, name: tappingName })).toBeTruthy();
    expect(seriesCalls(fetchMock, tappingPath).at(-1)?.get('side')).toBe('right');
    expect(seriesCalls(fetchMock, painPath).at(-1)?.get('range')).toBe('M');
  });

  it('links to the screen from the patient', async () => {
    checkInApi();
    renderAt(`/clinician/patients/${patient.id}`);
    const section = (await screen.findByRole('heading', { level: 2, name: 'Check-in' })).closest('section');
    if (!section) throw new Error('Check-in section missing');
    expect(within(section).getByRole('link').getAttribute('href')).toBe(`/clinician/patients/${patient.id}/check-in`);
  });
});

describe('metric maps', () => {
  it('describes every activity behind a metric', () => {
    for (const metricId of metricIds) {
      expect(aboutTests[metricDefinitions[metricId].activityId].summary).toBeTruthy();
    }
    expect(Object.keys(aboutTests).sort()).toEqual([...activityIds].sort());
  });

  it('names every metric and puts each in a domain', () => {
    for (const metricId of metricIds) {
      expect(metricNames[metricId]).toBeTruthy();
      expect(metricDomains[metricId]).toBeTruthy();
    }
  });
});
