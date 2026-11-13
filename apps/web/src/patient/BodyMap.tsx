import type { Language } from '@tempo/shared';
import { useSpoken } from './feedback.ts';
import { TapButton } from './TapButton.tsx';

const regions = [
  ['head-neck', 'Head or neck'],
  ['left-shoulder', 'Left shoulder'],
  ['right-shoulder', 'Right shoulder'],
  ['left-arm', 'Left arm'],
  ['right-arm', 'Right arm'],
  ['chest', 'Chest'],
  ['back', 'Back'],
  ['left-hip', 'Left hip'],
  ['right-hip', 'Right hip'],
  ['left-knee', 'Left knee'],
  ['right-knee', 'Right knee'],
  ['left-foot', 'Left foot'],
  ['right-foot', 'Right foot'],
] as const;

export type BodyRegion = (typeof regions)[number][0];

type BodyMapProps = {
  title: string;
  language: Language;
  onPick: (region: BodyRegion | undefined) => void;
};

export function BodyMap({ title, language, onPick }: BodyMapProps) {
  useSpoken(`${title} Tap the place that hurts.`, language);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6 text-[20pt]">
      <div className="flex min-h-[60pt] items-center justify-between gap-4">
        <h1 className="text-[28pt] font-bold leading-tight">{title}</h1>
        <TapButton variant="secondary" onTap={() => onPick(undefined)}>
          <span className="whitespace-nowrap text-[20pt]">Not sure</span>
        </TapButton>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {regions.map(([region, label]) => (
          <TapButton
            key={region}
            variant="secondary"
            className={region === 'head-neck' ? 'col-span-2' : ''}
            onTap={() => onPick(region)}
          >
            <span className="text-[20pt] leading-tight">{label}</span>
          </TapButton>
        ))}
      </div>
    </main>
  );
}
