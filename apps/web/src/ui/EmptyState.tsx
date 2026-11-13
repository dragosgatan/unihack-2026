import type { ReactNode } from 'react';
import { cx } from './cx.ts';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  message: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, message, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-10 text-center', className)}>
      {icon !== undefined && <div className="mb-3 size-12 text-label-tertiary [&>svg]:size-full">{icon}</div>}
      <h3 className="text-title-3 font-semibold text-label">{title}</h3>
      <p className="mt-1 max-w-sm text-subhead text-label-secondary">{message}</p>
      {action !== undefined && <div className="mt-5">{action}</div>}
    </div>
  );
}
