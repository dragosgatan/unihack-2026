import { bodyRegionLabels, bodyRegions, type BodyRegion, type Language } from '@tempo/shared';
import { useSpoken } from './feedback.ts';
import { TapButton } from './TapButton.tsx';

const en = { prompt: 'Tap the place that hurts.', notSure: 'Not sure' };
const copy: Record<Language, typeof en> = { en, ro: { prompt: 'Atingeți locul care vă doare.', notSure: 'Nu știu' } };

type BodyMapProps = {
  title: string;
  language: Language;
  onPick: (region: BodyRegion | undefined) => void;
};

export function BodyMap({ title, language, onPick }: BodyMapProps) {
  useSpoken(`${title} ${copy[language].prompt}`, language);

  return (
    <main lang={language} className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6 text-[20pt]">
      <div className="flex min-h-[60pt] items-center justify-between gap-4">
        <h1 className="text-[28pt] font-bold leading-tight">{title}</h1>
        <TapButton variant="secondary" onTap={() => onPick(undefined)}>
          <span className="whitespace-nowrap text-[20pt]">{copy[language].notSure}</span>
        </TapButton>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {bodyRegions.map((region) => (
          <TapButton
            key={region}
            variant="secondary"
            className={region === 'head-neck' ? 'col-span-2' : ''}
            onTap={() => onPick(region)}
          >
            <span className="text-[20pt] leading-tight">{bodyRegionLabels[language][region]}</span>
          </TapButton>
        ))}
      </div>
    </main>
  );
}
