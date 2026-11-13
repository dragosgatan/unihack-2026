import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, configure, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { routes } from '../routes.tsx';

configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

describe('router', () => {
  it('renders the design system showcase at /ui', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/ui'] });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Design system' })).toBeTruthy();
  });
});
