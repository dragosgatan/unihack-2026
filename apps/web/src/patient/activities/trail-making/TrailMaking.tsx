import { useEffect, useRef, useState } from 'react';
import type {
  Language,
  SessionPlanItem,
  Side,
  TrailMakingRawResult,
  TrailMakingTap,
  TrailMakingTarget,
} from '@tempo/shared';
import { trailProgress } from '@tempo/shared/scoring';
import { tapFeedback, useSpoken } from '../../feedback.ts';
import { Screen } from '../../Screen.tsx';
import { TapButton } from '../../TapButton.tsx';
import type { RunnerActivityProps } from '../index.ts';
import { trailLayout } from './layout.ts';

type Props = RunnerActivityProps<SessionPlanItem['config'], TrailMakingRawResult>;
type Part = 'a' | 'b';
type Phase = 'instructions' | 'hand' | 'practice' | 'ready' | 'task';

const numbers = (count: number) => Array.from({ length: count }, (_, index) => String(index + 1));
const alternating = (pairs: number) =>
  Array.from({ length: pairs }, (_, index) => [String(index + 1), String.fromCharCode(65 + index)]).flat();

const parts = {
  a: {
    title: 'Connect the numbers',
    order: '1, then 2, then 3, and so on, up to the last number',
    prompt: 'Tap 1, 2, 3 and so on, in order.',
    practice: numbers(4),
    task: numbers(12),
  },
  b: {
    title: 'Numbers and letters',
    order: 'switching between numbers and letters: 1, then A, then 2, then B, and so on',
    prompt: 'Tap 1, A, 2, B and so on, in order.',
    practice: alternating(2),
    task: alternating(6),
  },
} satisfies Record<Part, { title: string; order: string; prompt: string; practice: string[]; task: string[] }>;

function TrailMaking({ part, language, onComplete, onProgress }: Props & { part: Part }) {
  const { title, order, prompt, practice, task } = parts[part];
  const [phase, setPhase] = useState<Phase>('instructions');
  const [hand, setHand] = useState<Side>('right');
  const [layout] = useState(() => ({ practice: trailLayout(practice), task: trailLayout(task) }));

  const reportTask = (taps: TrailMakingTap[]) =>
    onProgress({ stage: 'task', partialData: { hand, targets: layout.task, taps } satisfies TrailMakingRawResult });

  if (phase === 'instructions') {
    return (
      <Screen
        title={title}
        text={`You will see circles. Tap them in order, ${order}. Use one hand. Go as quickly and carefully as you can.`}
        language={language}
        action={<TapButton onTap={() => setPhase('hand')}>Next</TapButton>}
      />
    );
  }

  if (phase === 'hand') {
    const pick = (side: Side) => {
      setHand(side);
      setPhase('practice');
      onProgress({ stage: 'practice', partialData: { hand: side } });
    };
    return (
      <Screen
        title="Which hand will you use?"
        text="Use the same hand until the end."
        language={language}
        action={
          <div className="flex flex-col gap-3">
            <TapButton onTap={() => pick('right')}>Right hand</TapButton>
            <TapButton onTap={() => pick('left')}>Left hand</TapButton>
          </div>
        }
      />
    );
  }

  if (phase === 'practice') {
    return (
      <Trail
        key="practice"
        targets={layout.practice}
        text={`Practice. Tap ${practice.join(', ')}, in order.`}
        language={language}
        onFinish={() => setPhase('ready')}
      />
    );
  }

  if (phase === 'ready') {
    return (
      <Screen
        title="Well done"
        text="Now the real one, with more circles. Go as quickly and carefully as you can."
        language={language}
        action={
          <TapButton
            onTap={() => {
              setPhase('task');
              reportTask([]);
            }}
          >
            Start
          </TapButton>
        }
      />
    );
  }

  return (
    <Trail
      key="task"
      targets={layout.task}
      text={prompt}
      language={language}
      onTap={reportTask}
      onFinish={(taps) => onComplete({ hand, targets: layout.task, taps })}
    />
  );
}

type TrailProps = {
  targets: TrailMakingTarget[];
  text: string;
  language: Language;
  onTap?: (taps: TrailMakingTap[]) => void;
  onFinish: (taps: TrailMakingTap[]) => void;
};

function Trail({ targets, text, language, onTap, onFinish }: TrailProps) {
  useSpoken(text, language);
  const start = useRef(0);
  useEffect(() => {
    start.current = performance.now();
  }, []);
  const [taps, setTaps] = useState<TrailMakingTap[]>([]);
  const { next } = trailProgress(taps, targets.length);
  const last = taps.at(-1);
  const wrong = last && last.target > next ? last.target : undefined;

  const tap = (target: number, now: number) => {
    if (next >= targets.length) return;
    tapFeedback();
    const updated = [...taps, { t: Math.round(now - start.current), target }];
    setTaps(updated);
    if (trailProgress(updated, targets.length).finishedAt === undefined) onTap?.(updated);
    else onFinish(updated);
  };

  const at = (target: TrailMakingTarget) => ({ x: `${target.x * 100}%`, y: `${target.y * 100}%` });

  const look = (index: number) => {
    if (index < next) return 'border-blue-600 bg-blue-600 text-white';
    if (index === wrong) return 'border-red-600 bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100';
    return 'border-neutral-400 bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100';
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-6 text-[20pt]">
      <div className="min-h-[60pt]" />
      <p className="text-center">{text}</p>
      <div className="relative min-h-[24rem] flex-1 touch-none select-none">
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {targets.slice(1, next).map((target, index) => {
            const from = targets[index];
            return (
              from && (
                <line
                  key={index}
                  x1={at(from).x}
                  y1={at(from).y}
                  x2={at(target).x}
                  y2={at(target).y}
                  className="stroke-blue-600"
                  strokeWidth={6}
                  strokeLinecap="round"
                />
              )
            );
          })}
        </svg>
        {targets.map((target, index) => (
          <button
            key={index}
            type="button"
            aria-label={target.label}
            style={{ left: at(target).x, top: at(target).y }}
            className={`absolute flex size-[60pt] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 text-[24pt] font-bold ${look(index)}`}
            onPointerDown={(event) => {
              if (event.isPrimary && event.button === 0) tap(index, performance.now());
            }}
            onClick={(event) => {
              if (event.detail === 0) tap(index, performance.now());
            }}
          >
            {target.label}
          </button>
        ))}
      </div>
    </main>
  );
}

export const TrailMakingA = (props: Props) => <TrailMaking part="a" {...props} />;
export const TrailMakingB = (props: Props) => <TrailMaking part="b" {...props} />;
