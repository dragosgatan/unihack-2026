import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Toggle } from './Toggle.tsx';

afterEach(cleanup);

function Controlled() {
  const [checked, setChecked] = useState(false);
  return <Toggle label="Reminders" checked={checked} onChange={setChecked} />;
}

describe('Toggle', () => {
  it('flips aria-checked on click', () => {
    render(<Controlled />);
    const toggle = screen.getByRole('switch', { name: 'Reminders' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });
});
