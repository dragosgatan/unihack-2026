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
const listLanguage: Language = 'en';

export function WordRecall(props: Props) {
  const delayed = wordRecallDelayedConfigSchema.safeParse(props.config);
  return delayed.success ? <DelayedRecall {...props} config={delayed.data} /> : <ImmediateRecall {...props} />;
}

function ImmediateRecall({ language, onComplete, onProgress }: Props) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [words] = useState(() => wordLists[Math.floor(Math.random() * wordLists.length)] ?? []);
  const [presentedAt, setPresentedAt] = useState('');
  const trial = { part: 'immediate' as const, language: listLanguage, words, presentedAt };

  if (phase === 'instructions') {
    return (
      <Screen
        title="Remember some words"
        text="I will say five words. Listen carefully and try to remember them. Then say back as many as you can, in any order. Later I will ask you for them again."
        language={language}
        action={
          <TapButton
            onTap={() => {
              setPhase('practice');
              onProgress({ stage: 'practice' });
            }}
          >
            Next
          </TapButton>
        }
      />
    );
  }

  if (phase === 'practice') {
    return (
      <Screen
        title="Practice"
        text="First, a practice with two words. Tap Listen."
        language={language}
        action={<TapButton onTap={() => setPhase('practice-listen')}>Listen</TapButton>}
      />
    );
  }

  if (phase === 'practice-listen') return <Playback words={practiceWords} language={listLanguage} onDone={() => setPhase('practice-recall')} />;

  if (phase === 'practice-recall') {
    return (
      <Recall
        text="Tap Speak and say the two words. Then tap I've finished."
        language={language}
        keep={false}
        onRecorded={() => setPhase('ready')}
      />
    );
  }

  if (phase === 'ready') {
    return (
      <Screen
        title="Well done"
        text="Now five words. Listen carefully. Tap Listen when you are ready."
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
            Listen
          </TapButton>
        }
      />
    );
  }

  if (phase === 'listen') return <Playback words={words} language={listLanguage} onDone={() => setPhase('recall')} />;

  return (
    <Recall
      text="Tap Speak and say all the words you remember, in any order. Then tap I've finished."
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
    return <Screen title="Time for a short rest" text="We will carry on in a moment." language={language} action={null} />;
  }

  const trial = { ...config, part: 'delayed' as const };
  return (
    <Recall
      title="The five words"
      text="Earlier I said five words. Tap Speak and say all of them you remember, in any order. Then tap I've finished."
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

  return <Screen title="Listen" text="" spoken="" language={language} action={null} />;
}

type RecallProps = {
  title?: string;
  text: string;
  language: Language;
  keep: boolean;
  onStarted?: (recording: RecordingStarted) => void;
  onRecorded: (recording: WordRecallRecording) => void;
};

function Recall({ title = 'Your turn', text, language, keep, onStarted, onRecorded }: RecallProps) {
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
        title="The microphone did not start"
        text="Check that this page may use the microphone, then try again."
        language={language}
        action={<TapButton onTap={speakNow}>Try again</TapButton>}
      />
    );
  }

  if (state !== 'idle') {
    return (
      <Screen
        title="Listening"
        text="Say the words now. Tap I've finished when you are done."
        spoken=""
        language={language}
        action={
          <TapButton disabled={state === 'starting'} onTap={recorder.stop}>
            I've finished
          </TapButton>
        }
      />
    );
  }

  return <Screen title={title} text={text} language={language} action={<TapButton onTap={speakNow}>Speak</TapButton>} />;
}
