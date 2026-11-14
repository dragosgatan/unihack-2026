import { useState } from 'react';
import type { ClockDrawingPoint, Language, SessionPlanItem, Side, SpiralTracingRawResult } from '@tempo/shared';
import { spiralPath } from '@tempo/shared/scoring';
import { DrawingArea, viewSize } from '../../DrawingArea.tsx';
import { HandChoice } from '../../HandChoice.tsx';
import { Screen } from '../../Screen.tsx';
import { TapButton } from '../../TapButton.tsx';
import type { RunnerActivityProps } from '../index.ts';

type Props = RunnerActivityProps<SessionPlanItem['config'], SpiralTracingRawResult>;
type Phase = 'instructions' | 'hand' | 'practice' | 'ready' | 'task';

// shortcut: browsers do not expose physical pixel size; ~0.16 mm per CSS px holds for current phones and is about right for tablets, measure per device model if desktop use matters.
const mmPerCssPx = 0.16;
const guideWidth = viewSize / 30;

const en = {
  title: 'Trace a spiral',
  instructions:
    'You will follow a spiral line with one finger, from the dot in the middle out to the end. Try to stay on the line and keep your finger on the screen. There is no rush.',
  next: 'Next',
  practice: 'Practice. Follow the circle with your finger, then tap Done.',
  wellDone: 'Well done',
  ready: 'Now the spiral. Start at the dot in the middle and follow the line out to the end. Tap Done when you have finished.',
  start: 'Start',
  task: 'Start at the dot and follow the spiral out to the end.',
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    title: 'Urmăriți spirala',
    instructions:
      'Veți urmări cu un deget o linie în spirală, de la punctul din mijloc până la capăt. Încercați să rămâneți pe linie și să țineți degetul pe ecran. Nu vă grăbiți.',
    next: 'Înainte',
    practice: 'Exercițiu. Urmăriți cercul cu degetul, apoi atingeți Gata.',
    wellDone: 'Foarte bine',
    ready: 'Acum spirala. Porniți de la punctul din mijloc și urmăriți linia până la capăt. Atingeți Gata când ați terminat.',
    start: 'Începe',
    task: 'Porniți de la punct și urmăriți spirala până la capăt.',
  },
};

const guide = (path: string) => (
  <>
    <path d={path} fill="none" className="stroke-neutral-300 dark:stroke-neutral-400" strokeWidth={guideWidth} strokeLinecap="round" />
    <circle cx={viewSize / 2} cy={viewSize / 2} r={guideWidth} className="fill-neutral-500" />
  </>
);

const spiralGuide = guide(spiralPath(viewSize));
const circleGuide = guide(`M${viewSize / 2} ${viewSize / 2}m0 -300a300 300 0 1 1 0 600a300 300 0 1 1 0 -600`);

export function SpiralTracing({ language, onComplete, onProgress }: Props) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [hand, setHand] = useState<Side>('right');
  const t = copy[language];

  const tracing = (strokes: ClockDrawingPoint[][], widthPx: number): SpiralTracingRawResult => ({
    hand,
    sizeMm: Number((widthPx * mmPerCssPx).toFixed(1)),
    strokes,
  });

  if (phase === 'instructions') {
    return (
      <Screen
        title={t.title}
        text={t.instructions}
        language={language}
        action={<TapButton onTap={() => setPhase('hand')}>{t.next}</TapButton>}
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
        text={t.practice}
        language={language}
        guide={circleGuide}
        onDone={() => setPhase('ready')}
      />
    );
  }

  if (phase === 'ready') {
    return (
      <Screen
        title={t.wellDone}
        text={t.ready}
        language={language}
        action={
          <TapButton
            onTap={() => {
              setPhase('task');
              onProgress({ stage: 'task', partialData: { hand } });
            }}
          >
            {t.start}
          </TapButton>
        }
      />
    );
  }

  return (
    <DrawingArea
      key="task"
      text={t.task}
      language={language}
      guide={spiralGuide}
      onChange={(strokes, widthPx) => onProgress({ stage: 'task', partialData: tracing(strokes, widthPx) })}
      onDone={(strokes, widthPx) => onComplete(tracing(strokes, widthPx))}
    />
  );
}
