import type { TextareaHTMLAttributes } from 'react';
import { cx } from './cx.ts';
import { FieldShell, type FieldProps } from './Field.tsx';
import { controlBorder, controlClasses } from './fieldStyles.ts';

export interface TextAreaProps extends FieldProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'aria-invalid' | 'aria-describedby'> {}

export function TextArea({ label, hint, error, className, rows = 4, ...props }: TextAreaProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {(control) => <textarea rows={rows} className={cx(controlClasses, controlBorder(error), 'resize-y py-2.5')} {...control} {...props} />}
    </FieldShell>
  );
}
