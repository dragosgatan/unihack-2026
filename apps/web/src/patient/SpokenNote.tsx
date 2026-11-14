import { useEffect, useRef, useState } from 'react';
import type { Language } from '@tempo/shared';
import { voices } from './feedback.ts';
import { Recognition, type Recognizer } from './recognition.ts';
import { Screen } from './Screen.tsx';
import { TapButton } from './TapButton.tsx';

const en = {
  listening: 'Listening',
  ownWords: 'Say it in your own words.',
  finished: "I've finished",
  thanks: 'Thank you',
  thanksSpoken: 'Thank you. Tap Send, or Say it again.',
  send: 'Send',
  again: 'Say it again',
  more: 'Do you want to say more?',
  moreText: 'Tap Speak and tell us in your own words.',
  speak: 'Speak',
  noThanks: 'No thanks',
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    listening: 'Vă ascult',
    ownWords: 'Spuneți cu cuvintele dumneavoastră.',
    finished: 'Am terminat',
    thanks: 'Vă mulțumim',
    thanksSpoken: 'Vă mulțumim. Atingeți Trimite sau Spune din nou.',
    send: 'Trimite',
    again: 'Spune din nou',
    more: 'Vreți să spuneți mai mult?',
    moreText: 'Atingeți Vorbește și spuneți-ne cu cuvintele dumneavoastră.',
    speak: 'Vorbește',
    noThanks: 'Nu, mulțumesc',
  },
};

type SpokenNoteProps = {
  language: Language;
  onDone: (note: string | undefined) => void;
};

export function SpokenNote({ language, onDone }: SpokenNoteProps) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const recognizer = useRef<Recognizer>(undefined);
  const t = copy[language];

  useEffect(() => () => recognizer.current?.abort(), []);

  const listen = () => {
    if (!Recognition) return onDone(undefined);
    const next = new Recognition();
    next.lang = voices[language];
    next.interimResults = true;
    next.onresult = (event) =>
      setHeard(
        Array.from(event.results)
          .map((result) => result[0]?.transcript ?? '')
          .join(' ')
          .trim(),
      );
    next.onend = () => setListening(false);
    recognizer.current?.abort();
    recognizer.current = next;
    setHeard('');
    try {
      next.start();
      setListening(true);
    } catch (error) {
      console.error('Speech recognition did not start', error);
    }
  };

  if (listening) {
    return (
      <Screen
        title={t.listening}
        text={heard || t.ownWords}
        spoken=""
        language={language}
        action={<TapButton onTap={() => recognizer.current?.stop()}>{t.finished}</TapButton>}
      />
    );
  }

  if (heard) {
    return (
      <Screen
        title={t.thanks}
        text={heard}
        spoken={t.thanksSpoken}
        language={language}
        action={<TapButton onTap={() => onDone(heard)}>{t.send}</TapButton>}
        secondary={
          <TapButton variant="secondary" onTap={listen}>
            {t.again}
          </TapButton>
        }
      />
    );
  }

  return (
    <Screen
      title={t.more}
      text={t.moreText}
      language={language}
      action={<TapButton onTap={listen}>{t.speak}</TapButton>}
      secondary={
        <TapButton variant="secondary" onTap={() => onDone(undefined)}>
          {t.noThanks}
        </TapButton>
      }
    />
  );
}
