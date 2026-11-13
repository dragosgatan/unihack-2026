import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cx } from './cx.ts';

export interface NavShellItem {
  to: string;
  label: string;
  icon: ReactNode;
}

export interface NavShellProps {
  items: NavShellItem[];
  children: ReactNode;
  accessory?: ReactNode;
  className?: string;
}

function isParentOfAnother(item: NavShellItem, items: NavShellItem[]) {
  const prefix = item.to.endsWith('/') ? item.to : `${item.to}/`;
  return items.some((other) => other !== item && other.to.startsWith(prefix));
}

export function NavShell({ items, children, accessory, className }: NavShellProps) {
  return (
    <div className={cx('min-h-dvh bg-grouped text-label', className)}>
      <nav
        aria-label="Main"
        className={cx(
          'material-bar fixed inset-x-0 bottom-0 z-20 flex border-t border-separator pb-[env(safe-area-inset-bottom,0px)]',
          'md:inset-x-auto md:inset-y-0 md:left-0 md:w-68 md:flex-col md:border-t-0 md:border-r md:px-3 md:pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]',
        )}
      >
        <p className="hidden px-3 pb-4 text-title-2 font-bold md:block">Tempo</p>
        <ul className="flex flex-1 md:flex-col md:gap-0.5">
          {items.map((item) => (
            <li key={item.to} className="flex flex-1 md:flex-none">
              <NavLink
                to={item.to}
                end={isParentOfAnother(item, items)}
                className={({ isActive }) =>
                  cx(
                    'pressable flex min-h-11 flex-1 touch-manipulation select-none flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-caption',
                    'md:flex-row md:justify-start md:gap-3 md:rounded-control md:px-3 md:py-2 md:text-body',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                    isActive ? 'text-accent md:bg-accent-soft' : 'text-label-secondary md:hover:bg-fill',
                  )
                }
              >
                <span className="flex size-6 shrink-0 items-center justify-center [&>svg]:size-6">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          ))}
          {accessory !== undefined && <li className="flex flex-1 items-center justify-center md:mt-auto md:flex-none md:justify-start md:px-1">{accessory}</li>}
        </ul>
      </nav>
      <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pb-0 md:pl-68">{children}</div>
    </div>
  );
}
