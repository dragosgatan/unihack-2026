import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from './cx.ts';

export interface LargeTitleProps {
  title: string;
  back?: { to: string; label: string };
  actions?: ReactNode;
  className?: string;
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 12 20" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-3 shrink-0">
      <path d="M10 2 2 10l8 8" />
    </svg>
  );
}

export function LargeTitle({ title, back, actions, className }: LargeTitleProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    const heading = headingRef.current;
    if (!bar || !heading) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setCollapsed(!entry.isIntersecting);
      },
      { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` },
    );
    observer.observe(heading);
    return () => observer.disconnect();
  }, []);

  const fade = 'transition-opacity duration-(--duration-fast) ease-out';

  return (
    <>
      <div ref={barRef} className="sticky top-0 z-10 isolate pt-[env(safe-area-inset-top,0px)]">
        <div aria-hidden="true" className={cx('material-bar absolute inset-0 -z-10 border-b border-separator', fade, collapsed ? 'opacity-100' : 'opacity-0')} />
        <div className="grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
          <div className="flex min-w-0 items-center justify-start">
            {back !== undefined && (
              <Link
                to={back.to}
                className="flex min-h-11 min-w-0 select-none items-center gap-1.5 rounded-control px-2 text-body text-accent active:opacity-60 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <ChevronLeftIcon />
                <span className="truncate">{back.label}</span>
              </Link>
            )}
          </div>
          <p aria-hidden="true" className={cx('min-w-0 truncate text-center text-headline', fade, collapsed ? 'opacity-100' : 'opacity-0')}>
            {title}
          </p>
          <div className="flex min-w-0 items-center justify-end gap-1">{actions}</div>
        </div>
      </div>
      <h1 ref={headingRef} className={cx('px-4 pt-1 pb-2 text-large-title', className)}>
        {title}
      </h1>
    </>
  );
}
