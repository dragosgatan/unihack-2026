import { useId, type ReactNode } from 'react';
import { cx } from './cx.ts';

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
}

export interface FieldControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

interface FieldShellProps extends FieldProps {
  className?: string;
  inline?: boolean;
  children: (control: FieldControlProps) => ReactNode;
}

export function FieldShell({ label, hint, error, className, inline = false, children }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const control = children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy });
  const labelElement = (
    <label htmlFor={id} className={inline ? 'text-body text-label' : 'text-subhead font-medium text-label'}>
      {label}
    </label>
  );

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {inline ? (
        <div className="flex min-h-11 items-center justify-between gap-4">
          {labelElement}
          {control}
        </div>
      ) : (
        <>
          {labelElement}
          {control}
        </>
      )}
      {hint && (
        <p id={hintId} className="text-footnote text-label-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-footnote text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
