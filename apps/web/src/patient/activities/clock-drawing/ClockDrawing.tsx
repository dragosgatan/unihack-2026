import { useState } from 'react';
import type { ClockDrawingPoint, ClockDrawingRawResult, SessionPlanItem, Side } from '@tempo/shared';
import { DrawingArea } from '../../DrawingArea.tsx';
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
