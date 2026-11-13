import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls } from 'motion/react';
import { cx } from './cx.ts';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

type SheetMode = 'slide' | 'pop' | 'fade';

interface DragSample {
  y: number;
  t: number;
}

interface DragState {
  pointerId: number;
  startY: number;
  startOffset: number;
  samples: DragSample[];
}

const desktopQuery = '(min-width: 48rem)';
const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const noDragSelector = 'a, button, input, select, textarea, [role="button"]';

const dismissFraction = 0.25;
const dismissVelocity = 500;
const velocityWindowMs = 100;

const slideOpen = { type: 'spring', bounce: 0, duration: 0.4 } as const;
const slideClose = { type: 'spring', bounce: 0, duration: 0.3 } as const;
const popOpen = { type: 'spring', bounce: 0, duration: 0.3 } as const;
const popClose = { type: 'spring', bounce: 0, duration: 0.2 } as const;
const fadeOpen = { duration: 0.2, ease: 'easeOut' } as const;
const fadeClose = { duration: 0.15, ease: 'easeOut' } as const;

function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

function releaseVelocity(samples: readonly DragSample[]): number {
  const last = samples.at(-1);
  if (!last) return 0;
  const first = samples.find((sample) => last.t - sample.t <= velocityWindowMs) ?? last;
  const elapsed = last.t - first.t;
  return elapsed > 0 ? ((last.y - first.y) / elapsed) * 1000 : 0;
}

function shouldDismiss(offset: number, velocity: number, height: number): boolean {
  return offset > height * dismissFraction || velocity > dismissVelocity;
}

function subscribeDesktop(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(desktopQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isDesktopNow() {
  return typeof window.matchMedia === 'function' && window.matchMedia(desktopQuery).matches;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector));
}

export function Sheet({ open, onClose, title, action, className, children }: SheetProps) {
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  const isDesktop = useSyncExternalStore(subscribeDesktop, isDesktopNow, () => false);
  const mode: SheetMode = reduceMotion ? 'fade' : isDesktop ? 'pop' : 'slide';

  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);

  const sheetRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(0);
  const shownRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const releaseVelocityRef = useRef<number | null>(null);

  const y = useMotionValue(0);
  const presence = useMotionValue(0);
  const popScale = useTransform(presence, [0, 1], [0.96, 1]);
  const scrimOpacity = useTransform([y, presence], ([offset = 0, shown = 0]: number[]) => {
    const height = heightRef.current;
    const remaining = height > 0 ? 1 - Math.min(Math.max(offset, 0) / height, 1) : 1;
    return shown * remaining;
  });

  const close = useEffectEvent(() => onClose());

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!present || !sheet) return;
    const height = sheet.offsetHeight;
    heightRef.current = height;
    const fresh = !shownRef.current;
    shownRef.current = true;
    let controls: AnimationPlaybackControls;

    if (open) {
      if (mode === 'slide') {
        if (fresh) y.jump(height);
        presence.jump(1);
        controls = animate(y, 0, slideOpen);
      } else {
        if (fresh) presence.jump(0);
        y.jump(0);
        controls = animate(presence, 1, mode === 'pop' ? popOpen : fadeOpen);
      }
    } else {
      const velocity = releaseVelocityRef.current;
      releaseVelocityRef.current = null;
      const finish = () => {
        shownRef.current = false;
        setPresent(false);
      };
      if (mode === 'slide') {
        controls = animate(y, height, { ...slideClose, ...(velocity === null ? {} : { velocity }), onComplete: finish });
      } else {
        controls = animate(presence, 0, { ...(mode === 'pop' ? popClose : fadeClose), onComplete: finish });
      }
    }

    return () => controls.stop();
  }, [open, present, mode, y, presence]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!open || !sheet) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (focusables(sheet)[0] ?? sheet).focus({ preventScroll: true });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) close();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus({ preventScroll: true });
    };
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const sheet = sheetRef.current;
    if (event.key !== 'Tab' || !sheet) return;
    const items = focusables(sheet);
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === sheet)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (isDesktop || !open || dragRef.current || !event.isPrimary || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(noDragSelector)) return;
    if (sheetRef.current) heightRef.current = sheetRef.current.offsetHeight;
    y.stop();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: y.get(),
      samples: [{ y: event.clientY, t: event.timeStamp }],
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const offset = drag.startOffset + event.clientY - drag.startY;
    y.set(offset < 0 ? rubberband(offset, heightRef.current) : offset);
    drag.samples.push({ y: event.clientY, t: event.timeStamp });
    if (drag.samples.length > 8) drag.samples.shift();
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    drag.samples.push({ y: event.clientY, t: event.timeStamp });
    const velocity = event.type === 'pointercancel' ? 0 : releaseVelocity(drag.samples);
    if (event.type !== 'pointercancel' && shouldDismiss(y.get(), velocity, heightRef.current)) {
      releaseVelocityRef.current = velocity;
      onClose();
      return;
    }
    animate(y, 0, { type: 'spring', bounce: reduceMotion ? 0 : 0.15, duration: 0.3, velocity });
  }

  if (!present) return null;

  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6',
        !open && 'pointer-events-none',
      )}
    >
      <motion.div
        aria-hidden="true"
        onClick={onClose}
        style={{ opacity: scrimOpacity }}
        className="absolute inset-0 touch-none bg-black/40 dark:bg-black/55"
      />
      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ y, opacity: presence, scale: mode === 'pop' ? popScale : 1 }}
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-sheet bg-surface-elevated pb-[env(safe-area-inset-bottom,0px)] text-label shadow-sheet outline-none',
          'after:absolute after:inset-x-0 after:top-full after:h-[50dvh] after:bg-surface-elevated',
          'md:max-h-[85dvh] md:max-w-lg md:rounded-sheet md:pb-0 md:after:hidden',
          className,
        )}
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          className="shrink-0 touch-none select-none md:touch-auto"
        >
          <div aria-hidden="true" className="mx-auto mt-1.5 h-1.25 w-9 rounded-full bg-label-tertiary md:hidden" />
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 py-1.5 md:py-2">
            <button
              type="button"
              onClick={onClose}
              className="pressable min-h-11 justify-self-start rounded-control px-2 text-body text-accent active:opacity-60 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Cancel
            </button>
            <h2 id={titleId} className="truncate text-center text-headline">
              {title}
            </h2>
            <div className="flex justify-self-end">{action}</div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-6">{children}</div>
      </motion.div>
    </div>,
    document.body,
  );
}
