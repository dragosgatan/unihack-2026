import type { ReactNode } from 'react';
import { cx } from './cx.ts';

export interface CardProps {
  title?: ReactNode;
  action?: ReactNode;
  onPress?: () => void;
  className?: string;
  children?: ReactNode;
}

export function Card({ title, action, onPress, className, children }: CardProps) {
  const TitleTag = onPress ? 'span' : 'h3';
  const content = (
    <>
      {(title !== undefined || action !== undefined) && (
        <span className="mb-2 flex items-center justify-between gap-3">
          {title !== undefined && <TitleTag className="text-subhead font-semibold text-label">{title}</TitleTag>}
          {action !== undefined && <span className="ml-auto shrink-0 text-subhead text-label-secondary">{action}</span>}
        </span>
      )}
      {children}
    </>
  );
  const base = 'block rounded-card bg-surface p-4 text-label shadow-card';

  if (onPress) {
    return (
      <button
        type="button"
        onClick={onPress}
        className={cx(
          base,
          'pressable w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          className,
        )}
      >
        {content}
      </button>
    );
  }

  return <div className={cx(base, className)}>{content}</div>;
}
