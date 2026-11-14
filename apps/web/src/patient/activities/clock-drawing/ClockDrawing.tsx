import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { ClockDrawingPoint, ClockDrawingRawResult, Language, SessionPlanItem, Side } from '@tempo/shared';
import { clockStrokesPath } from '@tempo/shared/scoring';
import { useSpoken } from '../../feedback.ts';
import { HandChoice } from '../../HandChoice.tsx';
import { Screen } from '../../Screen.tsx';
import { TapButton } from '../../TapButton.tsx';
import type { RunnerActivityProps } from '../index.ts';

type Props = RunnerActivityProps<SessionPlanItem['config'], ClockDrawingRawResult>;
type Phase = 'instructions' | 'hand' | 'practice' | 'ready' | 'task';

const targetTimes = [
  { time: '11:10', words: 'ten past eleven' },
  { time: '8:20', words: 'twenty past eight' },
  { time: '2:50', words: 'ten to three' },
  { time: '10:25', words: 'twenty-five past ten' },
] as const;

export function ClockDrawing({ language, onComplete, onProgress }: Props) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [hand, setHand] = useState<Side>('right');
  const [{ time, words }] = useState(() => targetTimes[Math.floor(Math.random() * targetTimes.length)] ?? targetTimes[0]);

  const drawing = (strokes: ClockDrawingPoint[][]): ClockDrawingRawResult => ({ hand, targetTime: time, strokes });

  if (phase === 'instructions') {
    return (
      <Screen
        title="Draw a clock"
        text="You will draw a clock with your finger, with all the numbers and two hands showing a time. Use one hand. There is no rush."
        language={language}
        action={<TapButton onTap={() => setPhase('hand')}>Next</TapButton>}
      />
    );
  }

  if (phase === 'hand') {
    return (
      <HandChoice
        language={language}
        onPick={(side) => {
          setHand(side);
          setPhase('practice');
          onProgress({ stage: 'practice', partialData: { hand: side } });
        }}
      />
    );
  }

  if (phase === 'practice') {
    return (
      <DrawingArea
        key="practice"
        text="Practice. Draw a circle with your finger, then tap Done."
        language={language}
        onDone={() => setPhase('ready')}
      />
    );
  }

  if (phase === 'ready') {
    return (
      <Screen
        title="Well done"
        text={`Now draw a clock. Put in all the numbers, and set the hands to ${words}. Tap Done when you have finished.`}
        language={language}
        action={
          <TapButton
            onTap={() => {
              setPhase('task');
              onProgress({ stage: 'task', partialData: drawing([]) });
            }}
          >
            Start
          </TapButton>
        }
      />
    );
  }

  return (
    <DrawingArea
      key="task"
      text={`Draw a clock with all the numbers. Set the hands to ${words}.`}
      language={language}
      onChange={(strokes) => onProgress({ stage: 'task', partialData: drawing(strokes) })}
      onDone={(strokes) => onComplete(drawing(strokes))}
    />
  );
}

type DrawingAreaProps = {
  text: string;
  language: Language;
  onChange?: (strokes: ClockDrawingPoint[][]) => void;
  onDone: (strokes: ClockDrawingPoint[][]) => void;
};

const viewSize = 1000;
const unit = (value: number) => Number(Math.min(1, Math.max(0, value)).toFixed(3));

function DrawingArea({ text, language, onChange, onDone }: DrawingAreaProps) {
  useSpoken(text, language);
  const start = useRef(0);
  useEffect(() => {
    start.current = performance.now();
  }, []);
  const strokes = useRef<ClockDrawingPoint[][]>([]);
  const pen = useRef<number | undefined>(undefined);
  const [drawn, setDrawn] = useState<ClockDrawingPoint[][]>([]);

  const update = (next: ClockDrawingPoint[][]) => {
    strokes.current = next;
    setDrawn(next);
    onChange?.(next);
  };

  const point = (event: PointerEvent<SVGSVGElement>): ClockDrawingPoint => {
    const box = event.currentTarget.getBoundingClientRect();
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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-6 text-[20pt]">
      <div className="min-h-[60pt]" />
      <p className="text-center">{text}</p>
      <div className="flex flex-1 items-center justify-center">
        <svg
          role="img"
          aria-label="Drawing area"
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
      <TapButton disabled={drawn.length === 0} onTap={() => onDone(strokes.current)}>
        Done
      </TapButton>
    </main>
  );
}
