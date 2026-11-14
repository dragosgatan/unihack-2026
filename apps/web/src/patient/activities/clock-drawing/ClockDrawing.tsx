import { useState } from 'react';
import type { ClockDrawingPoint, ClockDrawingRawResult, Language, SessionPlanItem, Side } from '@tempo/shared';
import { DrawingArea } from '../../DrawingArea.tsx';
import { HandChoice } from '../../HandChoice.tsx';
import { Screen } from '../../Screen.tsx';
import { TapButton } from '../../TapButton.tsx';
import type { RunnerActivityProps } from '../index.ts';

type Props = RunnerActivityProps<SessionPlanItem['config'], ClockDrawingRawResult>;
type Phase = 'instructions' | 'hand' | 'practice' | 'ready' | 'task';

const targetTimes = ['11:10', '8:20', '2:50', '10:25'] as const;
type TargetTime = (typeof targetTimes)[number];

const en = {
  times: { '11:10': 'ten past eleven', '8:20': 'twenty past eight', '2:50': 'ten to three', '10:25': 'twenty-five past ten' } satisfies Record<
    TargetTime,
    string
  >,
  title: 'Draw a clock',
  instructions: 'You will draw a clock with your finger, with all the numbers and two hands showing a time. Use one hand. There is no rush.',
  next: 'Next',
  practice: 'Practice. Draw a circle with your finger, then tap Done.',
  wellDone: 'Well done',
  ready: (words: string) => `Now draw a clock. Put in all the numbers, and set the hands to ${words}. Tap Done when you have finished.`,
  start: 'Start',
  task: (words: string) => `Draw a clock with all the numbers. Set the hands to ${words}.`,
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    times: { '11:10': 'unsprezece și zece', '8:20': 'opt și douăzeci', '2:50': 'trei fără zece', '10:25': 'zece și douăzeci și cinci' },
    title: 'Desenați un ceas',
    instructions:
      'Veți desena cu degetul un ceas, cu toate numerele și cu două limbi care arată o oră. Folosiți o singură mână. Nu vă grăbiți.',
    next: 'Înainte',
    practice: 'Exercițiu. Desenați un cerc cu degetul, apoi atingeți Gata.',
    wellDone: 'Foarte bine',
    ready: (words) => `Acum desenați un ceas. Puneți toate numerele și potriviți limbile la ora ${words}. Atingeți Gata când ați terminat.`,
    start: 'Începe',
    task: (words) => `Desenați un ceas cu toate numerele. Potriviți limbile la ora ${words}.`,
  },
};

export function ClockDrawing({ language, onComplete, onProgress }: Props) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [hand, setHand] = useState<Side>('right');
  const [time] = useState(() => targetTimes[Math.floor(Math.random() * targetTimes.length)] ?? targetTimes[0]);
  const t = copy[language];
  const words = t.times[time];

  const drawing = (strokes: ClockDrawingPoint[][]): ClockDrawingRawResult => ({ hand, targetTime: time, strokes });

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
        onDone={() => setPhase('ready')}
      />
    );
  }

  if (phase === 'ready') {
    return (
      <Screen
        title={t.wellDone}
        text={t.ready(words)}
        language={language}
        action={
          <TapButton
            onTap={() => {
              setPhase('task');
              onProgress({ stage: 'task', partialData: drawing([]) });
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
      text={t.task(words)}
      language={language}
      onChange={(strokes) => onProgress({ stage: 'task', partialData: drawing(strokes) })}
      onDone={(strokes) => onComplete(drawing(strokes))}
    />
  );
}
