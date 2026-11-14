import { useState } from 'react';
import type { ActivityId, Language, SkipStage } from '@tempo/shared';
import { Screen } from '../../Screen.tsx';
import { TapButton } from '../../TapButton.tsx';
import type { RunnerActivityProps } from '../index.ts';

const steps: Record<SkipStage, SkipStage | undefined> = { instructions: 'practice', practice: 'task', task: undefined };

const en = {
  steps: {
    instructions: 'This activity is not ready yet. These are its instructions.',
    practice: 'This is the practice round.',
    task: 'This is the task. Tap Done to move on.',
  } satisfies Record<SkipStage, string>,
  next: 'Next',
  done: 'Done',
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    steps: {
      instructions: 'Această activitate nu este gata încă. Acestea sunt instrucțiunile ei.',
      practice: 'Acesta este exercițiul.',
      task: 'Aceasta este sarcina. Atingeți Gata pentru a merge mai departe.',
    },
    next: 'Înainte',
    done: 'Gata',
  },
};

export function Placeholder({
  config,
  language,
  onComplete,
  onProgress,
}: RunnerActivityProps<{ activityId: ActivityId }, undefined>) {
  const [stage, setStage] = useState<SkipStage>('instructions');
  const next = steps[stage];
  const t = copy[language];

  const advance = () => {
    if (!next) return onComplete(undefined);
    setStage(next);
    onProgress({ stage: next, partialData: { reached: next } });
  };

  return (
    <Screen
      title={config.activityId}
      text={t.steps[stage]}
      language={language}
      action={<TapButton onTap={advance}>{next ? t.next : t.done}</TapButton>}
    />
  );
}
