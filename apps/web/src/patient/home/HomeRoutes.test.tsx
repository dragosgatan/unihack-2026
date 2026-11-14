import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { press } from '../activities/check-in-test-helpers.ts';
import { loadDevice } from './data.ts';
import { HomeRoutes } from './HomeRoutes.tsx';

const paired = { token: 'device-token', expiresAt: '2027-05-01T00:00:00.000Z', deviceId: 'dev-1', patientFirstName: 'Vasile', language: 'en' };

const renderHome = (url: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/patient/home/*" element={<HomeRoutes />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const typePin = async (pin: string) => {
  for (const digit of pin) press(digit);
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) =>
      path === '/api/device/pairing-code' ? new Response(JSON.stringify(paired)) : new Response('{}', { status: 404 }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HomeRoutes', () => {
  it('pairs from the QR link, sets a PIN, and asks for it on the next open', async () => {
    renderHome('/patient/home?code=123456');
    expect(await screen.findByRole('heading', { name: 'Choose a 4-digit PIN' })).toBeDefined();
    expect(fetch).toHaveBeenCalledWith('/api/device/pairing-code', expect.objectContaining({ body: JSON.stringify({ code: '123456' }) }));

    await typePin('1234');
    await typePin('9999');
    expect(screen.getByText('Those did not match. Please choose a PIN again.')).toBeDefined();

    await typePin('1234');
    await typePin('1234');
    expect(await screen.findByRole('heading', { name: 'Add Tempo to your home screen' })).toBeDefined();
    expect(JSON.stringify(loadDevice())).not.toContain('1234');

    cleanup();
    renderHome('/patient/home');
    await typePin('0000');
    expect(await screen.findByText('That PIN did not match. Please try again.')).toBeDefined();
    await typePin('1234');
    expect(await screen.findByRole('button', { name: 'I fell or felt unwell' })).toBeDefined();
  });

  it('keeps the language picked on the pairing screen and switches it from the today screen', async () => {
    renderHome('/patient/home');
    press('Română');
    expect(screen.getByRole('heading', { name: 'Introduceți codul de asociere' })).toBeDefined();

    await typePin('123456');
    expect(await screen.findByRole('heading', { name: 'Alegeți un PIN din 4 cifre' })).toBeDefined();
    expect(loadDevice()?.language).toBe('ro');

    await typePin('1234');
    await typePin('1234');
    press('Gata');
    press('English');
    expect(await screen.findByRole('button', { name: 'I fell or felt unwell' })).toBeDefined();
    expect(loadDevice()?.language).toBe('en');
  });
});
