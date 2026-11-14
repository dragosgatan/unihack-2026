import type { ReactNode } from 'react';
import type { Language } from '@tempo/shared';
import { useSpoken } from './feedback.ts';
import { TapButton } from './TapButton.tsx';

const tapOne: Record<Language, string> = { en: 'Tap one answer.', ro: 'Atingeți un răspuns.' };

type ChoicesProps<T> = {
  title: string;
  language: Language;
  options: [T, ReactNode][];
  onPick: (value: T) => void;
  layout?: string;
};

export function Choices<T>({ title, language, options, onPick, layout = 'flex flex-col' }: ChoicesProps<T>) {
  useSpoken(`${title} ${tapOne[language]}`, language);

  return (
    <main lang={language} className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6 text-[20pt]">
      <h1 className="text-[32pt] font-bold leading-tight">{title}</h1>
      <div className={`${layout} gap-3`}>
        {options.map(([value, label], index) => (
          <TapButton key={index} variant="secondary" className="py-3 text-left" onTap={() => onPick(value)}>
            <span className="text-[20pt] leading-tight">{label}</span>
          </TapButton>
        ))}
      </div>
    </main>
  );
}
