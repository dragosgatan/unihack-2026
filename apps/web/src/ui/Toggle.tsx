import { cx } from './cx.ts';
import { FieldShell, type FieldProps } from './Field.tsx';

export interface ToggleProps extends FieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Toggle({ label, hint, error, checked, onChange, disabled, className }: ToggleProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className} inline>
      {(control) => (
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cx(
            'relative inline-flex h-7.75 w-12.75 shrink-0 items-center rounded-full p-0.5',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40',
            checked ? 'bg-accent' : 'bg-fill',
          )}
          {...control}
        >
          <span
            aria-hidden="true"
            className={cx(
              'size-6.75 rounded-full bg-white shadow-card transition-transform duration-(--duration-fast) ease-out',
              checked ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      )}
    </FieldShell>
  );
}
