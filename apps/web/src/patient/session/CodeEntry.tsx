import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { sessionCodeSchema, type Language } from '@tempo/shared';
import { DigitEntry } from '../DigitEntry.tsx';

type CodeEntryProps<T> = {
  title: string;
  redeem: (code: string) => Promise<T>;
  onRedeemed: (redeemed: T) => void;
  initialCode?: string;
  language?: Language;
};

export function CodeEntry<T>({ title, redeem, onRedeemed, initialCode, language = 'en' }: CodeEntryProps<T>) {
  const [attempt, setAttempt] = useState(0);
  const mutation = useMutation({ mutationFn: redeem, onSuccess: onRedeemed, onError: () => setAttempt((n) => n + 1) });
  const redeemedInitial = useRef(false);

  useEffect(() => {
    if (redeemedInitial.current || !sessionCodeSchema.safeParse(initialCode).success) return;
    redeemedInitial.current = true;
    mutation.mutate(initialCode ?? '');
  }, [initialCode, mutation]);

  const message = mutation.isPending
    ? 'Checking the code…'
    : mutation.error instanceof TypeError
      ? 'No connection. Check the internet and try again.'
      : mutation.isError
        ? 'That code did not work. Please ask your therapist for a new one.'
        : 'Your therapist will give you the code.';

  return (
    <DigitEntry
      key={attempt}
      title={title}
      message={message}
      language={language}
      length={6}
      busy={mutation.isPending}
      onEntered={(code) => mutation.mutate(code)}
    />
  );
}
