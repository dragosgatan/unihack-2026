import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { metricIds, type MeResponse, type PatientDetailResponse, type PatientListResponse, type PatientMetricsResponse } from '@tempo/shared';
import { attending, medicalRecord, patient } from '../../../../packages/shared/src/test-fixtures.ts';
import { routes } from '../routes.tsx';
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
    const handler = handlers[url];
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
    expect(await within(pinned).findByRole('heading', { level: 3, name: metricNames['finger-tapping.taps-per-second'] })).toBeTruthy();
    expect(within(pinned).getByRole('heading', { level: 3, name: metricNames['pain.intensity'] })).toBeTruthy();
    expect(within(pinned).getByText('No data yet')).toBeTruthy();
  });

  it('shows Try again when the patient list fails and refetches on tap', async () => {
    let calls = 0;
    stubApi({ '/api/patients': () => (++calls === 1 ? json({ error: { code: 'internal', message: 'Boom' } }, 500) : json(patientList)) });
    renderAt('/clinician/patients');

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /Elena Dorian/ })).toBeTruthy());
  });
});

describe('metric maps', () => {
  it('names every metric and puts each in a domain', () => {
    for (const metricId of metricIds) {
      expect(metricNames[metricId]).toBeTruthy();
      expect(metricDomains[metricId]).toBeTruthy();
    }
  });
});
