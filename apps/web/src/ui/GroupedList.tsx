import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from './cx.ts';
import { ChevronRightIcon } from './icons.tsx';

export type RowTint =
  | 'accent'
  | 'positive'
  | 'warning'
  | 'critical'
  | 'cat-memory'
  | 'cat-attention'
  | 'cat-executive'
  | 'cat-motor'
  | 'cat-language'
  | 'cat-mobility';

const tintClasses: Record<RowTint, string> = {
  accent: 'bg-accent',
  positive: 'bg-positive',
  warning: 'bg-warning',
  critical: 'bg-critical',
  'cat-memory': 'bg-cat-memory',
  'cat-attention': 'bg-cat-attention',
  'cat-executive': 'bg-cat-executive',
  'cat-motor': 'bg-cat-motor',
  'cat-language': 'bg-cat-language',
  'cat-mobility': 'bg-cat-mobility',
};

export interface GroupedListProps {
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function GroupedList({ header, footer, className, children }: GroupedListProps) {
  const headerId = useId();
  return (
    <section className={className}>
      {header !== undefined && (
        <h2 id={headerId} className="px-4 pb-1.5 text-footnote uppercase text-label-secondary">
          {header}
        </h2>
      )}
      <ul aria-labelledby={header !== undefined ? headerId : undefined} className="overflow-hidden rounded-card bg-surface shadow-card">
        {children}
      </ul>
      {footer !== undefined && <p className="px-4 pt-1.5 text-footnote text-label-secondary">{footer}</p>}
    </section>
  );
}

export interface GroupedListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  icon?: ReactNode;
  iconTint?: RowTint;
  chevron?: boolean;
  onPress?: () => void;
  href?: string;
  className?: string;
}

export function GroupedListRow({ title, subtitle, value, icon, iconTint = 'accent', chevron = false, onPress, href, className }: GroupedListRowProps) {
  const interactive = href !== undefined || onPress !== undefined;
  const rowClass = cx(
    'flex w-full min-h-11 items-center gap-3 pl-4 text-left text-label',
    interactive && 'active:bg-fill focus-visible:bg-fill focus-visible:outline-none',
    className,
  );

  const content = (
    <>
      {icon !== undefined && (
        <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-lg text-white [&>svg]:size-4.5', tintClasses[iconTint])}>
          {icon}
        </span>
      )}
      <span className="flex min-h-11 flex-1 items-center gap-2 self-stretch border-b border-separator py-2.5 pr-4 group-last/row:border-b-0">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body">{title}</span>
          {subtitle !== undefined && <span className="truncate text-footnote text-label-secondary">{subtitle}</span>}
        </span>
        {value !== undefined && <span className="shrink-0 text-body text-label-secondary">{value}</span>}
        {chevron && <ChevronRightIcon className="h-3.5 w-2 shrink-0 text-label-tertiary" />}
      </span>
    </>
  );

  return (
    <li className="group/row">
      {href !== undefined ? (
        <Link to={href} className={rowClass}>
          {content}
        </Link>
      ) : onPress !== undefined ? (
        <button type="button" onClick={onPress} className={rowClass}>
          {content}
        </button>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  );
}
