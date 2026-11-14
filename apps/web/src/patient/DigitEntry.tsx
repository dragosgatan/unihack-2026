import { useState, type ReactNode } from 'react';
import type { Language } from '@tempo/shared';
import { useSpoken } from './feedback.ts';
import { TapButton } from './TapButton.tsx';

const en = { delete: 'Delete', entered: (count: number, length: number) => `${count} of ${length} digits entered` };
const copy: Record<Language, typeof en> = {
  en,
  ro: { delete: 'Șterge', entered: (count, length) => `${count} din ${length} cifre introduse` },
};

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0'];

type DigitEntryProps = {
  title: string;
  message: string;
  language: Language;
  length: number;
  onEntered: (digits: string) => void;
  masked?: boolean;
  busy?: boolean;
  secondary?: ReactNode;
};

export function DigitEntry({ title, message, language, length, onEntered, masked, busy, secondary }: DigitEntryProps) {
  const [digits, setDigits] = useState('');
  useSpoken(`${title} ${message}`, language);

  const press = (key: string) => {
    if (busy || digits.length >= length) return;
    const next = digits + key;
    setDigits(next);
    if (next.length === length) onEntered(next);
  };

  return (
    <main lang={language} className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6 text-[20pt]">
      {secondary && <div className="flex min-h-[60pt] justify-end">{secondary}</div>}
      <h1 className="text-center text-[32pt] font-bold">{title}</h1>
      <p className="text-center" role="status">
        {message}
      </p>
      <div className="flex justify-center gap-2" aria-label={copy[language].entered(digits.length, length)}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className="flex h-[48pt] w-[36pt] items-center justify-center rounded-xl border-2 border-neutral-400 font-mono text-[28pt]">
            {digits[i] === undefined ? '' : masked ? '●' : digits[i]}
          </span>
        ))}
      </div>
      <div className="mt-auto grid grid-cols-3 gap-3">
        {keys.map((key, i) =>
          key ? (
            <TapButton key={i} variant="secondary" disabled={busy} onTap={() => press(key)}>
              {key}
            </TapButton>
          ) : (
            <span key={i} />
          ),
        )}
        <TapButton variant="secondary" label={copy[language].delete} disabled={busy} onTap={() => setDigits(digits.slice(0, -1))}>
          ⌫
        </TapButton>
      </div>
    </main>
  );
}
