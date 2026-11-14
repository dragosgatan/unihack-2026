import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from './cx.ts';

export interface CardProps {
  title?: ReactNode;
  action?: ReactNode;
  onPress?: () => void;
  href?: string;
  className?: string;
  children?: ReactNode;
}

export function Card({ title, action, onPress, href, className, children }: CardProps) {
  const TitleTag = onPress || href !== undefined ? 'span' : 'h3';
  const content = (
    <>
      {(title !== undefined || action !== undefined) && (
        <span className="mb-2 flex items-center justify-between gap-3">
          {title !== undefined && <TitleTag className="min-w-0 text-subhead font-semibold text-label">{title}</TitleTag>}
          {action !== undefined && <span className="ml-auto shrink-0 text-subhead text-label-secondary">{action}</span>}
        </span>
      )}
      {children}
    </>
  );
  const base = 'block min-w-0 break-words rounded-card bg-surface p-4 text-label shadow-card';
  const pressableClass = 'pressable w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  if (href !== undefined) {
    return (
      <Link to={href} className={cx(base, pressableClass, className)}>
        {content}
      </Link>
    );
  }

  if (onPress) {
    return (
      <button
        type="button"
        onClick={onPress}
        className={cx(base, pressableClass, className)}
      >
        {content}
      </button>
    );
  }

  return <div className={cx(base, className)}>{content}</div>;
}
