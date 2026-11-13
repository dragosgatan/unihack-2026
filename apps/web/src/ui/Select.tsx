import type { SelectHTMLAttributes } from 'react';
import { cx } from './cx.ts';
import { FieldShell, type FieldProps } from './Field.tsx';
import { controlBorder, controlClasses } from './fieldStyles.ts';
import { ChevronDownIcon } from './icons.tsx';

export interface SelectProps extends FieldProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'aria-invalid' | 'aria-describedby'> {}

export function Select({ label, hint, error, className, children, ...props }: SelectProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {(control) => (
        <div className="relative">
          <select className={cx(controlClasses, controlBorder(error), 'min-h-11 appearance-none pr-10')} {...control} {...props}>
            {children}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3.5 h-2 w-3.5 -translate-y-1/2 text-label-secondary" />
        </div>
      )}
    </FieldShell>
  );
}
