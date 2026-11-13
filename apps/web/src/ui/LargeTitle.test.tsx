import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { LargeTitle } from './LargeTitle.tsx';

class StubIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', StubIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTitle() {
  render(
    <MemoryRouter>
      <LargeTitle title="Patients" back={{ to: '/clinician', label: 'Summary' }} actions={<button type="button">Add</button>} />
    </MemoryRouter>,
  );
}

describe('LargeTitle', () => {
  it('renders the title as the only h1', () => {
    renderTitle();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('Patients');
  });

  it('renders a back link to the given path with its label', () => {
    renderTitle();
    const link = screen.getByRole('link', { name: 'Summary' });
    expect(link.getAttribute('href')).toBe('/clinician');
  });

  it('hides the compact bar title from assistive technology and shows the actions', () => {
    renderTitle();
    const compact = screen.getAllByText('Patients').find((element) => element.tagName !== 'H1');
    expect(compact?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });
});
