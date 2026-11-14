import { useEffect, useRef, useState } from 'react';
import {
  wordRecallDelayedConfigSchema,
  type Language,
  type SessionPlanItem,
  type WordRecallDelayedConfig,
  type WordRecallRawResult,
  type WordRecallRecording,
} from '@tempo/shared';
import { speak } from '../../feedback.ts';
import { Screen } from '../../Screen.tsx';
import { TapButton } from '../../TapButton.tsx';
import type { RunnerActivityProps } from '../index.ts';
import { useRecorder, type RecordingStarted } from './useRecorder.ts';
import { practiceWords, wordLists } from './words.ts';

type Props = RunnerActivityProps<SessionPlanItem['config'], WordRecallRawResult>;
type Phase = 'instructions' | 'practice' | 'practice-listen' | 'practice-recall' | 'ready' | 'listen' | 'recall';

const wordGapMs = 1500;
const recallDelayMs = 5 * 60_000;

const en = {
  title: 'Remember some words',
  instructions:
    'I will say five words. Listen carefully and try to remember them. Then say back as many as you can, in any order. Later I will ask you for them again.',
  next: 'Next',
  practiceTitle: 'Practice',
  practice: 'First, a practice with two words. Tap Listen.',
  listen: 'Listen',
  practiceRecall: "Tap Speak and say the two words. Then tap I've finished.",
  wellDone: 'Well done',
  ready: 'Now five words. Listen carefully. Tap Listen when you are ready.',
  recall: "Tap Speak and say all the words you remember, in any order. Then tap I've finished.",
  rest: 'Time for a short rest',
  restText: 'We will carry on in a moment.',
  delayedTitle: 'The five words',
  delayed: "Earlier I said five words. Tap Speak and say all of them you remember, in any order. Then tap I've finished.",
  turn: 'Your turn',
  micFailed: 'The microphone did not start',
  micFailedText: 'Check that this page may use the microphone, then try again.',
  tryAgain: 'Try again',
  listening: 'Listening',
  sayNow: "Say the words now. Tap I've finished when you are done.",
  finished: "I've finished",
  speak: 'Speak',
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    title: 'Țineți minte câteva cuvinte',
    instructions:
      'Vă voi spune cinci cuvinte. Ascultați cu atenție și încercați să le țineți minte. Apoi spuneți-le pe cele pe care vi le amintiți, în orice ordine. Mai târziu vă voi cere să le spuneți din nou.',
    next: 'Înainte',
    practiceTitle: 'Exercițiu',
    practice: 'Mai întâi, un exercițiu cu două cuvinte. Atingeți Ascultă.',
    listen: 'Ascultă',
    practiceRecall: 'Atingeți Vorbește și spuneți cele două cuvinte. Apoi atingeți Am terminat.',
    wellDone: 'Foarte bine',
    ready: 'Acum cinci cuvinte. Ascultați cu atenție. Atingeți Ascultă când sunteți gata.',
    recall: 'Atingeți Vorbește și spuneți toate cuvintele pe care vi le amintiți, în orice ordine. Apoi atingeți Am terminat.',
    rest: 'O scurtă pauză',
    restText: 'Continuăm imediat.',
    delayedTitle: 'Cele cinci cuvinte',
    delayed:
      'Mai devreme v-am spus cinci cuvinte. Atingeți Vorbește și spuneți-le pe toate cele pe care vi le amintiți, în orice ordine. Apoi atingeți Am terminat.',
    turn: 'Rândul dumneavoastră',
    micFailed: 'Microfonul nu a pornit',
    micFailedText: 'Verificați că pagina are voie să folosească microfonul, apoi încercați din nou.',
    tryAgain: 'Încearcă din nou',
    listening: 'Vă ascult',
    sayNow: 'Spuneți cuvintele acum. Atingeți Am terminat când ați terminat.',
    finished: 'Am terminat',
    speak: 'Vorbește',
  },
};

export function WordRecall(props: Props) {
  const delayed = wordRecallDelayedConfigSchema.safeParse(props.config);
  return delayed.success ? <DelayedRecall {...props} config={delayed.data} /> : <ImmediateRecall {...props} />;
}

function ImmediateRecall({ language, onComplete, onProgress }: Props) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [listIndex] = useState(() => Math.floor(Math.random() * wordLists[language].length));
  const [presentedAt, setPresentedAt] = useState('');
  const words = wordLists[language][listIndex] ?? [];
  const trial = { part: 'immediate' as const, language, words, presentedAt };
  const t = copy[language];

  if (phase === 'instructions') {
    return (
      <Screen
        title={t.title}
        text={t.instructions}
        language={language}
        action={
          <TapButton
            onTap={() => {
              setPhase('practice');
              onProgress({ stage: 'practice' });
            }}
          >
            {t.next}
          </TapButton>
        }
      />
    );
  }

  if (phase === 'practice') {
    return (
      <Screen
        title={t.practiceTitle}
        text={t.practice}
        language={language}
        action={<TapButton onTap={() => setPhase('practice-listen')}>{t.listen}</TapButton>}
      />
    );
  }

  if (phase === 'practice-listen') return <Playback words={practiceWords[language]} language={language} onDone={() => setPhase('practice-recall')} />;

  if (phase === 'practice-recall') {
    return (
      <Recall
        text={t.practiceRecall}
        language={language}
        keep={false}
        onRecorded={() => setPhase('ready')}
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
              const at = new Date().toISOString();
              setPresentedAt(at);
              setPhase('listen');
              onProgress({ stage: 'task', partialData: { ...trial, presentedAt: at } });
            }}
          >
            {t.listen}
          </TapButton>
        }
      />
    );
  }

  if (phase === 'listen') return <Playback words={words} language={language} onDone={() => setPhase('recall')} />;

  return (
    <Recall
      text={t.recall}
      language={language}
      keep
      onStarted={(recording) => onProgress({ stage: 'task', partialData: { ...trial, recording } })}
      onRecorded={(recording) => onComplete({ ...trial, recording })}
    />
  );
}

function DelayedRecall({ config, language, onComplete, onProgress }: Omit<Props, 'config'> & { config: WordRecallDelayedConfig }) {
  const [waitMs] = useState(() => Date.parse(config.presentedAt) + recallDelayMs - Date.now());
  const [resting, setResting] = useState(waitMs > 0);

  useEffect(() => {
    if (!resting) return;
    const timer = setTimeout(() => setResting(false), waitMs);
    return () => clearTimeout(timer);
  }, [resting, waitMs]);

  if (resting) {
    return <Screen title={copy[language].rest} text={copy[language].restText} language={language} action={null} />;
  }

  const trial = { ...config, part: 'delayed' as const };
  return (
    <Recall
      title={copy[language].delayedTitle}
      text={copy[language].delayed}
      language={language}
      keep
      onStarted={(recording) => onProgress({ stage: 'task', partialData: { ...trial, recording } })}
      onRecorded={(recording) => onComplete({ ...trial, recording })}
    />
  );
}

function Playback({ words, language, onDone }: { words: string[]; language: Language; onDone: () => void }) {
  const done = useRef(onDone);

  useEffect(() => {
    const timers = words.map((word, index) => setTimeout(() => speak(word, language), (index + 1) * wordGapMs));
    timers.push(setTimeout(() => done.current(), (words.length + 1) * wordGapMs));
    return () => timers.forEach(clearTimeout);
  }, [words, language]);

  return <Screen title={copy[language].listen} text="" spoken="" language={language} action={null} />;
}

type RecallProps = {
  title?: string;
  text: string;
  language: Language;
  keep: boolean;
  onStarted?: (recording: RecordingStarted) => void;
  onRecorded: (recording: WordRecallRecording) => void;
};

function Recall({ title, text, language, keep, onStarted, onRecorded }: RecallProps) {
  const t = copy[language];
  const [state, setState] = useState<'idle' | 'starting' | 'listening' | 'failed'>('idle');
  const recorder = useRecorder();

  const speakNow = () => {
    setState('starting');
    recorder.start(keep, onRecorded).then(
      (started) => {
        if (!started) return;
        setState('listening');
        onStarted?.(started);
      },
      (error: unknown) => {
        console.error('Microphone did not start', error);
        setState('failed');
      },
    );
  };

  if (state === 'failed') {
    return (
      <Screen
        title={t.micFailed}
        text={t.micFailedText}
        language={language}
        action={<TapButton onTap={speakNow}>{t.tryAgain}</TapButton>}
      />
    );
  }

  if (state !== 'idle') {
    return (
      <Screen
        title={t.listening}
        text={t.sayNow}
        spoken=""
        language={language}
        action={
          <TapButton disabled={state === 'starting'} onTap={recorder.stop}>
            {t.finished}
          </TapButton>
        }
      />
    );
  }

  return <Screen title={title ?? t.turn} text={text} language={language} action={<TapButton onTap={speakNow}>{t.speak}</TapButton>} />;
}
