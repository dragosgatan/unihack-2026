import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'destructive';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent active:bg-accent-pressed',
  secondary: 'bg-accent-soft text-accent',
  plain: 'bg-transparent text-accent active:opacity-60',
  destructive: 'bg-critical-soft text-critical',
};

const sizeClasses: Record<ButtonSize, string> = {
  md: 'min-h-11 rounded-control px-4 text-headline',
  lg: 'min-h-15 rounded-card px-6 text-title-3 font-semibold',
};

export function Button({ variant = 'primary', size = 'md', fullWidth = false, type = 'button', className, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'pressable inline-flex select-none items-center justify-center gap-2 text-center font-semibold',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-default disabled:opacity-40',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  );
}
