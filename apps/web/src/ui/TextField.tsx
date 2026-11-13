import type { InputHTMLAttributes } from 'react';
import { cx } from './cx.ts';
import { FieldShell, type FieldProps } from './Field.tsx';
import { controlBorder, controlClasses } from './fieldStyles.ts';

export interface TextFieldProps extends FieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-invalid' | 'aria-describedby'> {}

export function TextField({ label, hint, error, className, type = 'text', ...props }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {(control) => <input type={type} className={cx(controlClasses, controlBorder(error), 'min-h-11')} {...control} {...props} />}
    </FieldShell>
  );
}
