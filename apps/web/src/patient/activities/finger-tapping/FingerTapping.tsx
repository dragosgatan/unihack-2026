import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  fingerTappingConfigSchema,
  type FingerTappingConfig,
  type FingerTappingRawResult,
  type FingerTappingTap,
  type FingerTappingTrial,
  type Language,
  type SessionPlanItem,
  type Side,
} from '@tempo/shared';
import { tapFeedback, useSpoken } from '../../feedback.ts';
import { Screen } from '../../Screen.tsx';
import { TapButton } from '../../TapButton.tsx';
import type { RunnerActivityProps } from '../index.ts';

const practiceTaps = 6;
const defaultConfig: FingerTappingConfig = { sides: ['right', 'left'], trialDurationMs: 15000 };

type Target = FingerTappingTap['target'];
type Phase = { kind: 'instructions' } | { kind: 'practice' } | { kind: 'hand'; index: number } | { kind: 'trial'; index: number };

const parseConfig = (config: SessionPlanItem['config']): FingerTappingConfig => {
  const parsed = fingerTappingConfigSchema.safeParse(config);
  if (!parsed.success) console.warn('Finger tapping config is invalid, using both hands for 15 seconds');
  return parsed.success ? parsed.data : defaultConfig;
};

export function FingerTapping({
  config,
  language,
  onComplete,
  onProgress,
}: RunnerActivityProps<SessionPlanItem['config'], FingerTappingRawResult>) {
  const [{ sides, trialDurationMs }] = useState(() => parseConfig(config));
  const [phase, setPhase] = useState<Phase>({ kind: 'instructions' });
  const trials = useRef<FingerTappingTrial[]>([]);

  const reportTask = (current?: FingerTappingTrial) =>
    onProgress({ stage: 'task', partialData: { trials: current ? [...trials.current, current] : trials.current } });

  const toHand = (index: number) => {
    setPhase({ kind: 'hand', index });
    reportTask();
  };

  const endTrial = (trial: FingerTappingTrial) => {
    trials.current = [...trials.current, trial];
    const next = trials.current.length;
    if (next < sides.length) toHand(next);
    else onComplete({ trials: trials.current });
  };

  if (phase.kind === 'instructions') {
    return (
      <Screen
        title="Finger tapping"
        text="Put the device flat on a table. Use one finger of one hand. Tap the two circles one after the other, as fast as you can, until you hear stop."
        language={language}
        action={
          <TapButton
            onTap={() => {
              setPhase({ kind: 'practice' });
              onProgress({ stage: 'practice' });
            }}
          >
            Practise
          </TapButton>
        }
      />
    );
  }

  if (phase.kind === 'practice') {
    return <Practice side={sides[0] ?? 'right'} language={language} onDone={() => toHand(0)} />;
  }

  const side = sides[phase.index] ?? 'right';

  if (phase.kind === 'hand') {
    const first = phase.index === 0;
    return (
      <Screen
        title={first ? 'Well done' : 'Stop'}
        text={`${first ? 'Now the real one.' : 'Now the other hand.'} Use your ${side} hand. Tap as fast as you can until you hear stop.`}
        language={language}
        action={<TapButton onTap={() => setPhase({ kind: 'trial', index: phase.index })}>Start</TapButton>}
      />
    );
  }

  return (
    <Trial
      key={phase.index}
      side={side}
      durationMs={trialDurationMs}
      language={language}
      onTap={reportTask}
      onEnd={endTrial}
    />
  );
}

function Practice({ side, language, onDone }: { side: Side; language: Language; onDone: () => void }) {
  const taps = useRef(0);

  return (
    <TapArea
      text={`Practice. Use your ${side} hand. Tap the two circles one after the other.`}
      language={language}
      onTap={() => {
        taps.current += 1;
        if (taps.current === practiceTaps) onDone();
      }}
    />
  );
}

type TrialProps = {
  side: Side;
  durationMs: number;
  language: Language;
  onTap: (partial: FingerTappingTrial) => void;
  onEnd: (trial: FingerTappingTrial) => void;
};

function Trial({ side, durationMs, language, onTap, onEnd }: TrialProps) {
  const taps = useRef<FingerTappingTap[]>([]);
  const start = useRef<number>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const tap = (timeStamp: number, target: Target, x: number, y: number) => {
    if (start.current === undefined) {
      start.current = timeStamp;
      timer.current = setTimeout(() => onEnd({ side, prosthesis: false, durationMs, taps: taps.current }), durationMs);
    }
    const t = timeStamp - start.current;
    if (t >= durationMs) return;
    taps.current = [...taps.current, { t, target, x, y }];
    onTap({ side, prosthesis: false, durationMs: t, taps: taps.current });
  };

  return <TapArea text={`Use your ${side} hand. Tap as fast as you can.`} language={language} onTap={tap} />;
}

type TapAreaProps = {
  text: string;
  language: Language;
  onTap: (timeStamp: number, target: Target, x: number, y: number) => void;
};

function TapArea({ text, language, onTap }: TapAreaProps) {
  useSpoken(text, language);
  const [next, setNext] = useState<Target>('a');

  const tap = (target: Target, timeStamp: number, x: number, y: number) => {
    tapFeedback();
    setNext(target === 'a' ? 'b' : 'a');
    onTap(timeStamp, target, x, y);
  };

  const circle = (target: Target, label: string) => (
    <button
      type="button"
      aria-label={label}
      className={`aspect-square w-[min(40vw,14rem)] touch-manipulation select-none rounded-full transition-transform active:scale-95 ${
        next === target ? 'bg-blue-600' : 'bg-blue-200 dark:bg-blue-900'
      }`}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        tap(target, event.timeStamp, event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
      }}
      onClick={(event) => {
        if (event.detail === 0) tap(target, event.timeStamp, 0, 0);
      }}
    />
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 p-6 text-[20pt]">
      <div className="min-h-[60pt]" />
      <p className="flex flex-1 items-center justify-center text-center">{text}</p>
      <div className="flex justify-around pb-[10vh]">
        {circle('a', 'First circle')}
        {circle('b', 'Second circle')}
      </div>
    </main>
  );
}
