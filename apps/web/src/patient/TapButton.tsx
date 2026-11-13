import type { ReactNode } from 'react';
import { tapFeedback } from './feedback.ts';

const repeatGuardMs = 300;
let lastTap = -Infinity;

const variants = {
  primary: 'bg-blue-600 text-white active:bg-blue-800',
  secondary: 'bg-neutral-200 text-neutral-900 active:bg-neutral-400 dark:bg-neutral-800 dark:text-neutral-100 dark:active:bg-neutral-600',
};

type TapButtonProps = {
  onTap: () => void;
  children: ReactNode;
  variant?: keyof typeof variants;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function TapButton({ onTap, children, variant = 'primary', disabled, label, className = '' }: TapButtonProps) {
  const tap = (timeStamp: number) => {
    if (timeStamp - lastTap < repeatGuardMs) return;
    lastTap = timeStamp;
    tapFeedback();
    onTap();
  };

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={`min-h-[60pt] min-w-[60pt] touch-manipulation select-none rounded-2xl px-6 text-[24pt] font-semibold transition-transform active:scale-95 disabled:opacity-40 ${variants[variant]} ${className}`}
      onPointerDown={(event) => {
        if (event.isPrimary && event.button === 0) tap(event.timeStamp);
      }}
      onClick={(event) => {
        if (event.detail === 0) tap(event.timeStamp);
      }}
    >
      {children}
    </button>
  );
}
