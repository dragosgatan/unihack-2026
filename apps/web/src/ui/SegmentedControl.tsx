import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cx } from './cx.ts';

export interface SegmentedOption<T> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  className?: string;
}

const slide = { type: 'spring', bounce: 0, duration: 0.3 } as const;
const jump = { duration: 0 } as const;

export function SegmentedControl<T extends string | number>({ options, value, onChange, 'aria-label': ariaLabel, className }: SegmentedControlProps<T>) {
  const pillId = useId();
  const reduceMotion = useReducedMotion();
  const segments = useRef<(HTMLButtonElement | null)[]>([]);

  function select(next: T) {
    if (next !== value) onChange(next);
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>, next: T) {
    if (event.button !== 0) return;
    select(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const nextIndex = (index + step + options.length) % options.length;
    const next = options[nextIndex];
    if (!next) return;
    segments.current[nextIndex]?.focus();
    select(next.value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx('grid auto-cols-fr grid-flow-col rounded-control bg-fill p-0.5', className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            ref={(element) => {
              segments.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onPointerDown={(event) => handlePointerDown(event, option.value)}
            onClick={() => select(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className="relative min-h-8 touch-manipulation select-none px-3 text-subhead font-medium text-label focus-visible:outline-2 focus-visible:outline-accent rounded-[calc(var(--radius-control)-0.125rem)]"
          >
            {selected && (
              <motion.span
                layoutId={pillId}
                transition={reduceMotion ? jump : slide}
                className="absolute inset-0 rounded-[calc(var(--radius-control)-0.125rem)] bg-segment-selected shadow-card"
              />
            )}
            <span className={cx('relative', selected && 'font-semibold')}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
