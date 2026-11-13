import type { ReactNode } from 'react';
import { cx } from './cx.ts';

export type BadgeTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'critical';

export interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-fill text-label-secondary',
  accent: 'bg-accent-soft text-accent',
  positive: 'bg-positive-soft text-positive',
  warning: 'bg-warning-soft text-warning',
  critical: 'bg-critical-soft text-critical',
};

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold', toneClasses[tone], className)}>
      {children}
    </span>
  );
}
