import { useEffect, useRef, useState } from 'react';
import type { Language } from '@tempo/shared';
import { voices } from './feedback.ts';
import { Recognition, type Recognizer } from './recognition.ts';
import { Screen } from './Screen.tsx';
import { TapButton } from './TapButton.tsx';

type SpokenNoteProps = {
  language: Language;
  onDone: (note: string | undefined) => void;
};

export function SpokenNote({ language, onDone }: SpokenNoteProps) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const recognizer = useRef<Recognizer>(undefined);

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
        title="Listening"
        text={heard || 'Say it in your own words.'}
        spoken=""
        language={language}
        action={<TapButton onTap={() => recognizer.current?.stop()}>I've finished</TapButton>}
      />
    );
  }

  if (heard) {
    return (
      <Screen
        title="Thank you"
        text={heard}
        spoken="Thank you. Tap Send, or Say it again."
        language={language}
        action={<TapButton onTap={() => onDone(heard)}>Send</TapButton>}
        secondary={
          <TapButton variant="secondary" onTap={listen}>
            Say it again
          </TapButton>
        }
      />
    );
  }

  return (
    <Screen
      title="Do you want to say more?"
      text="Tap Speak and tell us in your own words."
      language={language}
      action={<TapButton onTap={listen}>Speak</TapButton>}
      secondary={
        <TapButton variant="secondary" onTap={() => onDone(undefined)}>
          No thanks
        </TapButton>
      }
    />
  );
}
