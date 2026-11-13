import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl.tsx';

afterEach(cleanup);

const options = [
  { value: 'W', label: 'W' },
  { value: 'M', label: 'M' },
  { value: 'Y', label: 'Y' },
];

describe('SegmentedControl', () => {
  it('selects a segment on pointer-down', () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Range" options={options} value="W" onChange={onChange} />);
    fireEvent.pointerDown(screen.getByRole('radio', { name: 'Y' }), { button: 0 });
    expect(onChange).toHaveBeenCalledWith('Y');
  });

  it('selects the next segment on ArrowRight', () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Range" options={options} value="W" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'W' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('M');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'M' }));
  });

  it('gives only the selected segment tabIndex 0', () => {
    render(<SegmentedControl aria-label="Range" options={options} value="M" onChange={() => undefined} />);
    const tabIndexes = screen.getAllByRole('radio').map((radio) => radio.tabIndex);
    expect(tabIndexes).toEqual([-1, 0, -1]);
  });
});
