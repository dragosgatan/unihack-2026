import type { Language } from '@tempo/shared';
import { Screen } from '../Screen.tsx';
import { TapButton } from '../TapButton.tsx';

type InstallEvent = Event & { prompt: () => Promise<void> };
const isInstallEvent = (event: Event): event is InstallEvent => 'prompt' in event;

let deferred: InstallEvent | undefined;

window.addEventListener('beforeinstallprompt', (event) => {
  if (!isInstallEvent(event)) return;
  event.preventDefault();
  deferred = event;
});

export function InstallPrompt({ language, onDone }: { language: Language; onDone: () => void }) {
  const install = deferred;

  if (!install) {
    return (
      <Screen
        title="Add Tempo to your home screen"
        text="Tap the Share button, then Add to Home Screen. Then you can open Tempo like any other app."
        language={language}
        action={<TapButton onTap={onDone}>Done</TapButton>}
      />
    );
  }

  return (
    <Screen
      title="Add Tempo to your home screen"
      text="Then you can open Tempo like any other app."
      language={language}
      action={
        <TapButton
          onTap={() => {
            deferred = undefined;
            install.prompt().then(onDone, onDone);
          }}
        >
          Add to home screen
        </TapButton>
      }
      secondary={
        <TapButton variant="secondary" onTap={onDone}>
          Not now
        </TapButton>
      }
    />
  );
}
