import { useEffect, useRef, useState } from 'react';
import type { Language } from '@tempo/shared';
import { activityModules } from '../activities/index.ts';
import { Placeholder } from '../activities/placeholder/Placeholder.tsx';
import { Screen } from '../Screen.tsx';
import { TapButton } from '../TapButton.tsx';
import { CodeEntry } from './CodeEntry.tsx';
import {
  completeActivity,
  completedResult,
  isFinished,
  restoreRunner,
  startRunner,
  submission,
  type RunnerState,
  type Stage,
} from './runner.ts';
import { finishRunner, loadRunner, saveRunner, syncOutbox } from './store.ts';

const sync = () => void syncOutbox().catch(console.error);

export function SessionRunner() {
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<RunnerState>();
  const [finished, setFinished] = useState<{ name: string; language: Language }>();
  const completedKey = useRef('');

  useEffect(() => {
    loadRunner()
      .then((stored) => setState(stored && restoreRunner(stored)), console.error)
      .finally(() => setLoaded(true));
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, []);

  useEffect(() => {
    if (state) saveRunner(state).catch(console.error);
  }, [state]);

  if (!loaded) return null;

  if (finished) {
    return (
      <Screen
        title="That's everything for today"
        text={`Thank you, ${finished.name}.`}
        language={finished.language}
        action={<TapButton onTap={() => setFinished(undefined)}>Done</TapButton>}
      />
    );
  }

  if (!state) return <CodeEntry onRedeemed={(redeemed) => setState(startRunner(redeemed))} />;

  const language = state.plan.language;
  const go = (stage: Stage) => setState({ ...state, stage });

  const finish = (final: RunnerState) => {
    finishRunner({ sessionId: final.session.id, token: final.token, body: submission(final) }).then(() => {
      setState(undefined);
      setFinished({ name: final.patientFirstName, language: final.plan.language });
      sync();
    }, console.error);
  };

  if (state.stage === 'welcome') {
    return (
      <Screen
        title={`Hello, ${state.patientFirstName}`}
        text="Tap Start when you are ready."
        language={language}
        action={<TapButton onTap={() => go('activity')}>Start</TapButton>}
      />
    );
  }

  if (state.stage === 'between') {
    return (
      <Screen
        title="Thank you"
        text="Tap Continue when you are ready for the next one."
        language={language}
        action={<TapButton onTap={() => go('activity')}>Continue</TapButton>}
        secondary={
          <TapButton variant="secondary" onTap={() => go('paused')}>
            Take a break
          </TapButton>
        }
      />
    );
  }

  if (state.stage === 'paused') {
    return (
      <Screen
        title="Taking a break"
        text="Tap Carry on when you are ready."
        language={language}
        action={<TapButton onTap={() => go('activity')}>Carry on</TapButton>}
        secondary={
          <TapButton variant="secondary" onTap={() => finish(state)}>
            Finish for today
          </TapButton>
        }
      />
    );
  }

  const index = state.index;
  const item = state.plan.items[index];
  if (!item) return null;

  const onComplete = (data: unknown) => {
    const key = `${state.session.id}:${index}`;
    if (completedKey.current === key) return;
    completedKey.current = key;
    const result = completedResult(item.activityId, data, new Date());
    if (!result) console.warn(`Result for ${item.activityId} failed validation and was not saved`);
    const next = completeActivity(state, result);
    if (isFinished(next)) finish(next);
    else setState(next);
  };

  const Module = activityModules[item.activityId];
  return Module ? (
    <Module key={index} config={item.config} language={language} onComplete={onComplete} />
  ) : (
    <Placeholder key={index} config={{ activityId: item.activityId }} language={language} onComplete={onComplete} />
  );
}
