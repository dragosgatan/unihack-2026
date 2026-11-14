import type { ReactNode } from 'react';
import type { Language } from '@tempo/shared';
import { useSpoken } from './feedback.ts';

type ScreenProps = {
  title: string;
  text: string;
  language: Language;
  action: ReactNode;
  secondary?: ReactNode;
  spoken?: string;
};

export function Screen({ title, text, language, action, secondary, spoken = `${title} ${text}` }: ScreenProps) {
  useSpoken(spoken, language);

  return (
    <main lang={language} className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 p-6 text-[20pt]">
      <div className="flex min-h-[60pt] justify-end">{secondary}</div>
      <div className="flex flex-1 flex-col justify-center gap-4 text-center">
        <h1 className="text-[32pt] font-bold">{title}</h1>
        <p>{text}</p>
      </div>
      <div className="flex flex-col">{action}</div>
    </main>
  );
}
