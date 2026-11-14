import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { sessionCodeSchema, type Language } from '@tempo/shared';
import { DigitEntry } from '../DigitEntry.tsx';
import { browserLanguage } from '../feedback.ts';
import { LanguageSwitch } from '../LanguageSwitch.tsx';

const en = {
  checking: 'Checking the code…',
  offline: 'No connection. Check the internet and try again.',
  failed: 'That code did not work. Please ask your therapist for a new one.',
  hint: 'Your therapist will give you the code.',
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    checking: 'Verificăm codul…',
    offline: 'Nu există conexiune. Verificați internetul și încercați din nou.',
    failed: 'Codul nu a funcționat. Cereți un cod nou terapeutului.',
    hint: 'Terapeutul vă va da codul.',
  },
};

type CodeEntryProps<T> = {
  title: Record<Language, string>;
  redeem: (code: string) => Promise<T>;
  onRedeemed: (redeemed: T, chosenLanguage: Language | undefined) => void;
  initialCode?: string;
};

export function CodeEntry<T>({ title, redeem, onRedeemed, initialCode }: CodeEntryProps<T>) {
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<Language>();
  const mutation = useMutation({
    mutationFn: redeem,
    onSuccess: (redeemed) => onRedeemed(redeemed, chosen),
    onError: () => setAttempt((n) => n + 1),
  });
  const redeemedInitial = useRef(false);
  const language = chosen ?? browserLanguage();
  const t = copy[language];

  useEffect(() => {
    if (redeemedInitial.current || !sessionCodeSchema.safeParse(initialCode).success) return;
    redeemedInitial.current = true;
    mutation.mutate(initialCode ?? '');
  }, [initialCode, mutation]);

  const message = mutation.isPending
    ? t.checking
    : mutation.error instanceof TypeError
      ? t.offline
      : mutation.isError
        ? t.failed
        : t.hint;

  return (
    <DigitEntry
      key={attempt}
      title={title[language]}
      message={message}
      language={language}
      length={6}
      busy={mutation.isPending}
      onEntered={(code) => mutation.mutate(code)}
      secondary={<LanguageSwitch language={language} onChange={setChosen} />}
    />
  );
}
