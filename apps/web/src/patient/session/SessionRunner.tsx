import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import type { Language, SubmittedResult } from '@tempo/shared';
import { activityModules } from '../activities/index.ts';
import { Placeholder } from '../activities/placeholder/Placeholder.tsx';
import { LanguageSwitch } from '../LanguageSwitch.tsx';
import { warmPoseAssetsInBackground } from '../pose/assets.ts';
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

const en = {
  codeTitle: 'Enter your session code',
  everything: "That's everything for today",
  thankName: (name: string) => `Thank you, ${name}.`,
  done: 'Done',
  hello: (name: string) => `Hello, ${name}`,
  ready: 'Tap Start when you are ready.',
  start: 'Start',
  thanks: 'Thank you',
  next: 'Tap Continue when you are ready for the next one.',
  continue: 'Continue',
  takeBreak: 'Take a break',
  break: 'Taking a break',
  carryOnText: 'Tap Carry on when you are ready.',
  carryOn: 'Carry on',
  finish: 'Finish for today',
  fine: "That's fine",
  tell: "We'll let your therapist know.",
  cannotDo: "I can't do this",
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    codeTitle: 'Introduceți codul sesiunii',
    everything: 'Asta a fost tot pentru azi',
    thankName: (name) => `Vă mulțumim, ${name}.`,
    done: 'Gata',
    hello: (name) => `Bună ziua, ${name}`,
    ready: 'Atingeți Începe când sunteți gata.',
    start: 'Începe',
    thanks: 'Vă mulțumim',
    next: 'Atingeți Continuă când sunteți gata pentru următorul.',
    continue: 'Continuă',
    takeBreak: 'Ia o pauză',
    break: 'Pauză',
    carryOnText: 'Atingeți Mergem mai departe când sunteți gata.',
    carryOn: 'Mergem mai departe',
    finish: 'Termină pentru azi',
    fine: 'Nicio problemă',
    tell: 'Îi vom spune terapeutului.',
    cannotDo: 'Nu pot face asta',
  },
};

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

  const hasExercise = state?.plan.items.some((item) => item.kind === 'exercise') ?? false;
  useEffect(() => {
    if (hasExercise) warmPoseAssetsInBackground();
  }, [hasExercise]);

  if (!loaded) return null;

  if (finished) {
    const t = copy[finished.language];
    return (
      <Screen
        title={t.everything}
        text={t.thankName(finished.name)}
        language={finished.language}
        action={<TapButton onTap={() => setFinished(undefined)}>{t.done}</TapButton>}
      />
    );
  }

  if (!state) {
    if (exitTo) return <Navigate to={exitTo} replace />;
    return (
      <CodeEntry
        title={{ en: en.codeTitle, ro: copy.ro.codeTitle }}
        redeem={redeemSessionCode}
        onRedeemed={(redeemed, chosen) => setState(startRunner(chosen ? { ...redeemed, plan: { ...redeemed.plan, language: chosen } } : redeemed))}
      />
    );
  }

  const language = state.plan.language;
  const t = copy[language];
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
        title={t.hello(state.patientFirstName)}
        text={t.ready}
        language={language}
        action={<TapButton onTap={() => go('activity')}>{t.start}</TapButton>}
        secondary={<LanguageSwitch language={language} onChange={(next) => setState({ ...state, plan: { ...state.plan, language: next } })} />}
      />
    );
  }

  if (state.stage === 'between') {
    return (
      <Screen
        title={t.thanks}
        text={t.next}
        language={language}
        action={<TapButton onTap={() => go('activity')}>{t.continue}</TapButton>}
        secondary={
          <TapButton variant="secondary" onTap={() => go('paused')}>
            {t.takeBreak}
          </TapButton>
        }
      />
    );
  }

  if (state.stage === 'paused') {
    return (
      <Screen
        title={t.break}
        text={t.carryOnText}
        language={language}
        action={<TapButton onTap={() => go('activity')}>{t.carryOn}</TapButton>}
        secondary={
          <TapButton variant="secondary" onTap={() => finish(state)}>
            {t.finish}
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
        title={t.fine}
        text={t.tell}
        language={language}
        action={<TapButton onTap={() => (done ? finish(state) : go('activity'))}>{t.continue}</TapButton>}
        secondary={
          !done && (
            <TapButton variant="secondary" onTap={() => go('paused')}>
              {t.takeBreak}
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
            <span lang={language}>{t.cannotDo}</span>
          </TapButton>
        </div>
      )}
    </>
  );
}
