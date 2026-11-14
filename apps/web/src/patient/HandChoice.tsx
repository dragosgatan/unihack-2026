import type { Language, Side } from '@tempo/shared';
import { Screen } from './Screen.tsx';
import { TapButton } from './TapButton.tsx';

export function HandChoice({ language, onPick }: { language: Language; onPick: (side: Side) => void }) {
  return (
    <Screen
      title="Which hand will you use?"
      text="Use the same hand until the end."
      language={language}
      action={
        <div className="flex flex-col gap-3">
          <TapButton onTap={() => onPick('right')}>Right hand</TapButton>
          <TapButton onTap={() => onPick('left')}>Left hand</TapButton>
        </div>
      }
    />
  );
}
