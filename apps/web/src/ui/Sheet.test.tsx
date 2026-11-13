import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Sheet } from './Sheet.tsx';

afterEach(cleanup);

function renderOpen(onClose = vi.fn()) {
  render(
    <Sheet open title="New note" onClose={onClose}>
      <input aria-label="Note" />
    </Sheet>,
  );
  return onClose;
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <Sheet open={open} title="New note" onClose={() => setOpen(false)}>
        <input aria-label="Note" />
      </Sheet>
    </>
  );
}

describe('Sheet', () => {
  it('renders nothing while closed', () => {
    render(
      <Sheet open={false} title="New note" onClose={() => undefined}>
        <p>Body</p>
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a modal dialog named by its title when open', () => {
    renderOpen();
    const dialog = screen.getByRole('dialog', { name: 'New note' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('closes on Escape', () => {
    const onClose = renderOpen();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the scrim is clicked but not when the sheet is', () => {
    const onClose = renderOpen();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    fireEvent.click(screen.getByRole('textbox', { name: 'Note' }));
    expect(onClose).not.toHaveBeenCalled();
    const scrim = dialog.previousElementSibling;
    expect(scrim).toBeTruthy();
    if (scrim) fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the Cancel button', () => {
    const onClose = renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the sheet and returns it to the opener', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open sheet' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'New note' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(opener);
  });
});
