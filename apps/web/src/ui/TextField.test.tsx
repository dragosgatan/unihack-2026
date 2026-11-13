import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TextField } from './TextField.tsx';

afterEach(cleanup);

describe('TextField', () => {
  it('marks itself invalid and is described by the error', () => {
    render(<TextField label="Email" hint="Work address" error="Enter a valid email address." />);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(' ');
    const description = describedBy.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(description).toContain('Enter a valid email address.');
  });
});
