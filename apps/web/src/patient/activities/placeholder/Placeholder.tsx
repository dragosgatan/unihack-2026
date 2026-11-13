import { useState } from 'react';
import type { ActivityId, SkipStage } from '@tempo/shared';
import { Screen } from '../../Screen.tsx';
import { TapButton } from '../../TapButton.tsx';
import type { RunnerActivityProps } from '../index.ts';

const steps: Record<SkipStage, { text: string; next?: SkipStage }> = {
  instructions: { text: 'This activity is not ready yet. These are its instructions.', next: 'practice' },
  practice: { text: 'This is the practice round.', next: 'task' },
  task: { text: 'This is the task. Tap Done to move on.' },
};

export function Placeholder({
  config,
  language,
  onComplete,
  onProgress,
}: RunnerActivityProps<{ activityId: ActivityId }, undefined>) {
  const [stage, setStage] = useState<SkipStage>('instructions');
  const { text, next } = steps[stage];

  const advance = () => {
    if (!next) return onComplete(undefined);
    setStage(next);
    onProgress({ stage: next, partialData: { reached: next } });
  };

  return (
    <Screen
      title={config.activityId}
      text={text}
      language={language}
      action={<TapButton onTap={advance}>{next ? 'Next' : 'Done'}</TapButton>}
    />
  );
}
