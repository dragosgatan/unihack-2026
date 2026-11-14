import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { ClockDrawingPoint, Language } from '@tempo/shared';
import { clockStrokesPath } from '@tempo/shared/scoring';
import { useSpoken } from './feedback.ts';
import { TapButton } from './TapButton.tsx';

type DrawingAreaProps = {
  text: string;
  language: Language;
  guide?: ReactNode;
  onChange?: (strokes: ClockDrawingPoint[][], widthPx: number) => void;
  onDone: (strokes: ClockDrawingPoint[][], widthPx: number) => void;
};

const en = { area: 'Drawing area', done: 'Done' };
const copy: Record<Language, typeof en> = { en, ro: { area: 'Zona de desen', done: 'Gata' } };

export const viewSize = 1000;
const unit = (value: number) => Number(Math.min(1, Math.max(0, value)).toFixed(3));

export function DrawingArea({ text, language, guide, onChange, onDone }: DrawingAreaProps) {
  useSpoken(text, language);
  const start = useRef(0);
  useEffect(() => {
    start.current = performance.now();
  }, []);
  const strokes = useRef<ClockDrawingPoint[][]>([]);
  const pen = useRef<number | undefined>(undefined);
  const width = useRef(0);
  const [drawn, setDrawn] = useState<ClockDrawingPoint[][]>([]);

  const update = (next: ClockDrawingPoint[][]) => {
    strokes.current = next;
    setDrawn(next);
    onChange?.(next, width.current);
  };

  const point = (event: PointerEvent<SVGSVGElement>): ClockDrawingPoint => {
    const box = event.currentTarget.getBoundingClientRect();
    width.current = box.width;
    return {
      t: Math.round(performance.now() - start.current),
      x: unit((event.clientX - box.left) / box.width),
      y: unit((event.clientY - box.top) / box.height),
    };
  };

  const lift = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerId === pen.current) pen.current = undefined;
  };

  return (
    <main lang={language} className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-6 text-[20pt]">
      <div className="min-h-[60pt]" />
      <p className="text-center">{text}</p>
      <div className="flex flex-1 items-center justify-center">
        <svg
          role="img"
          aria-label={copy[language].area}
          viewBox={`0 0 ${viewSize} ${viewSize}`}
          className="aspect-square w-full max-w-[55dvh] touch-none select-none rounded-3xl border-4 border-neutral-300 bg-white dark:border-neutral-600"
          onPointerDown={(event) => {
            if (!event.isPrimary || pen.current !== undefined) return;
            pen.current = event.pointerId;
            update([...strokes.current, [point(event)]]);
          }}
          onPointerMove={(event) => {
            if (event.pointerId !== pen.current) return;
            const last = strokes.current.at(-1) ?? [];
            update([...strokes.current.slice(0, -1), [...last, point(event)]]);
          }}
          onPointerUp={lift}
          onPointerCancel={lift}
          onPointerLeave={lift}
        >
          {guide}
          <path
            d={clockStrokesPath(drawn, viewSize)}
            fill="none"
            className="stroke-neutral-900"
            strokeWidth={viewSize / 100}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <TapButton disabled={drawn.length === 0} onTap={() => onDone(strokes.current, width.current)}>
        {copy[language].done}
      </TapButton>
    </main>
  );
}
