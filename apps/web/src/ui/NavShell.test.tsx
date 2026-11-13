import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NavShell } from './NavShell.tsx';

afterEach(cleanup);

const items = [
  { to: '/clinician', label: 'Summary', icon: <svg /> },
  { to: '/clinician/patients', label: 'Patients', icon: <svg /> },
  { to: '/clinician/browse', label: 'Browse', icon: <svg /> },
];

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <NavShell items={items} accessory={<button type="button">Assistant</button>}>
        <p>Page</p>
      </NavShell>
    </MemoryRouter>,
  );
}

describe('NavShell', () => {
  it('renders one main navigation landmark with the accessory and content', () => {
    renderAt('/clinician');
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Assistant' })).toBeTruthy();
    expect(screen.getByText('Page')).toBeTruthy();
  });

  it('marks only the item for the current path as the current page', () => {
    renderAt('/clinician/patients/p1');
    expect(screen.getByRole('link', { name: 'Patients' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Summary' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'Browse' }).getAttribute('aria-current')).toBeNull();
  });

  it('marks the root item on its own path', () => {
    renderAt('/clinician');
    expect(screen.getByRole('link', { name: 'Summary' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Patients' }).getAttribute('aria-current')).toBeNull();
  });
});
