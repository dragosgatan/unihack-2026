import type { Language, Side } from '@tempo/shared';
import { Screen } from './Screen.tsx';
import { TapButton } from './TapButton.tsx';

const en = { title: 'Which hand will you use?', text: 'Use the same hand until the end.', right: 'Right hand', left: 'Left hand' };
const copy: Record<Language, typeof en> = {
  en,
  ro: { title: 'Cu ce mână veți lucra?', text: 'Folosiți aceeași mână până la sfârșit.', right: 'Mâna dreaptă', left: 'Mâna stângă' },
};

export function HandChoice({ language, onPick }: { language: Language; onPick: (side: Side) => void }) {
  const t = copy[language];
  return (
    <Screen
      title={t.title}
      text={t.text}
      language={language}
      action={
        <div className="flex flex-col gap-3">
          <TapButton onTap={() => onPick('right')}>{t.right}</TapButton>
          <TapButton onTap={() => onPick('left')}>{t.left}</TapButton>
        </div>
      }
    />
  );
}
