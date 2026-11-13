import { useState } from 'react';
import type { Language, SkipReason } from '@tempo/shared';
import { BodyMap } from '../BodyMap.tsx';
import { useSpoken } from '../feedback.ts';
import { canTranscribe } from '../recognition.ts';
import { SpokenNote } from '../SpokenNote.tsx';
import { TapButton } from '../TapButton.tsx';
import type { SkipAnswer } from './runner.ts';

const reasons: [SkipReason, string][] = [
  ['pain', 'It hurts'],
  ['tired', "I'm too tired"],
  ['not-understood', "I don't understand what to do"],
  ['cannot-see-or-hear', "I can't see or hear it well enough"],
  ['physically-unable', "I can't physically do it"],
  ['device-problem', 'Something is wrong with the device'],
  ['other', 'Something else'],
];

const title = 'Can you tell us why?';

type CannotDoProps = {
  language: Language;
  onAnswer: (answer: SkipAnswer) => void;
};

export function CannotDo({ language, onAnswer }: CannotDoProps) {
  const [step, setStep] = useState<'reason' | 'pain' | 'note'>('reason');

  if (step === 'pain') {
    return <BodyMap title="Where does it hurt?" language={language} onPick={(painLocation) => onAnswer({ reason: 'pain', painLocation })} />;
  }
  if (step === 'note') return <SpokenNote language={language} onDone={(note) => onAnswer({ reason: 'other', note })} />;

  const pick = (reason: SkipReason) => {
    if (reason === 'pain') setStep('pain');
    else if (reason === 'other' && canTranscribe()) setStep('note');
    else onAnswer({ reason });
  };

  return <Reasons language={language} onPick={pick} />;
}

function Reasons({ language, onPick }: { language: Language; onPick: (reason: SkipReason) => void }) {
  useSpoken(`That's fine. ${title} Tap one answer.`, language);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6 text-[20pt]">
      <h1 className="text-[32pt] font-bold leading-tight">{title}</h1>
      <div className="flex flex-col gap-3">
        {reasons.map(([reason, label]) => (
          <TapButton key={reason} variant="secondary" className="py-3 text-left" onTap={() => onPick(reason)}>
            <span className="text-[20pt] leading-tight">{label}</span>
          </TapButton>
        ))}
      </div>
    </main>
  );
}
