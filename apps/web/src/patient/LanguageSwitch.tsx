import type { Language } from '@tempo/shared';
import { TapButton } from './TapButton.tsx';

const names: Record<Language, string> = { en: 'English', ro: 'Română' };

export function LanguageSwitch({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  const other: Language = language === 'en' ? 'ro' : 'en';
  return (
    <TapButton variant="secondary" onTap={() => onChange(other)}>
      <span lang={other}>{names[other]}</span>
    </TapButton>
  );
}
