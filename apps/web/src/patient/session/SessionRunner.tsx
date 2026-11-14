import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import type { Language, SubmittedResult } from '@tempo/shared';
import { activityModules } from '../activities/index.ts';
import { Placeholder } from '../activities/placeholder/Placeholder.tsx';
import { Screen } from '../Screen.tsx';
import { TapButton } from '../TapButton.tsx';
import { CannotDo } from './CannotDo.tsx';
import { CodeEntry } from './CodeEntry.tsx';
import {
  cannotDo,
  completeActivity,
  completedResult,
  isFinished,
  restoreRunner,
  skipActivity,
  startRunner,
  submission,
  type ActivityProgress,
  type RunnerState,
  type Stage,
} from './runner.ts';
import { finishRunner, loadRunner, redeemSessionCode, saveRunner, syncOutbox } from './store.ts';

const sync = () => void syncOutbox().catch(console.error);

type SessionRunnerProps = {
  exitTo?: string;
  onFinish?: (results: SubmittedResult[], at: Date) => void;
};

export function SessionRunner({ exitTo, onFinish }: SessionRunnerProps) {
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<RunnerState>();
  const [finished, setFinished] = useState<{ name: string; language: Language }>();
  const completedKey = useRef('');
  const progress = useRef<{ key: string; value: ActivityProgress }>(undefined);

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

  if (!state) {
    if (exitTo) return <Navigate to={exitTo} replace />;
    return <CodeEntry title="Enter your session code" redeem={redeemSessionCode} onRedeemed={(redeemed) => setState(startRunner(redeemed))} />;
  }

  const language = state.plan.language;
  const go = (stage: Stage) => setState({ ...state, stage });

  const finish = (final: RunnerState) => {
    finishRunner({ sessionId: final.session.id, token: final.token, body: submission(final) }).then(() => {
      setState(undefined);
      onFinish?.(final.results, new Date());
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

  if (state.stage === 'cannot-do') {
    return <CannotDo language={language} onAnswer={(answer) => setState(skipActivity(state, answer, new Date()))} />;
  }

  if (state.stage === 'skipped') {
    const done = isFinished(state);
    return (
      <Screen
        title="That's fine"
        text="We'll let your therapist know."
        language={language}
        action={<TapButton onTap={() => (done ? finish(state) : go('activity'))}>Continue</TapButton>}
        secondary={
          !done && (
            <TapButton variant="secondary" onTap={() => go('paused')}>
              Take a break
            </TapButton>
          )
        }
      />
    );
  }

  const index = state.index;
  const item = state.plan.items[index];
  if (!item) return null;

  const key = `${state.session.id}:${index}`;

  const onComplete = (data: unknown) => {
    if (completedKey.current === key) return;
    completedKey.current = key;
    const result = completedResult(item.activityId, data, new Date());
    if (!result) console.warn(`Result for ${item.activityId} failed validation and was not saved`);
    const next = completeActivity(state, result);
    if (isFinished(next)) finish(next);
    else setState(next);
  };

  const onProgress = (value: ActivityProgress) => {
    progress.current = { key, value };
  };

  const onCannotDo = () => {
    if (completedKey.current === key) return;
    completedKey.current = key;
    setState(cannotDo(state, progress.current?.key === key ? progress.current.value : { stage: 'instructions' }));
  };

  const Module = activityModules[item.activityId];
  const props = { language, onComplete, onProgress };
  return (
    <>
      {Module ? (
        <Module
          key={key}
          {...props}
          config={{ side: item.side, targetRepetitions: item.targetRepetitions, targetAngle: item.targetAngle, ...item.config }}
        />
      ) : (
        <Placeholder key={key} {...props} config={{ activityId: item.activityId }} />
      )}
      {item.kind !== 'check-in' && (
        <div className="pointer-events-none fixed inset-x-0 top-0 mx-auto flex max-w-2xl p-6">
          <TapButton variant="secondary" className="pointer-events-auto" onTap={onCannotDo}>
            I can't do this
          </TapButton>
        </div>
      )}
    </>
  );
}
