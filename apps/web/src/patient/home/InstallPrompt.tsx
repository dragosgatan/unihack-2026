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

const en = {
  title: 'Add Tempo to your home screen',
  manual: 'Tap the Share button, then Add to Home Screen. Then you can open Tempo like any other app.',
  done: 'Done',
  text: 'Then you can open Tempo like any other app.',
  add: 'Add to home screen',
  notNow: 'Not now',
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    title: 'Adăugați Tempo pe ecranul principal',
    manual: 'Atingeți butonul Partajare, apoi Adaugă pe ecranul principal. Apoi puteți deschide Tempo ca pe orice altă aplicație.',
    done: 'Gata',
    text: 'Apoi puteți deschide Tempo ca pe orice altă aplicație.',
    add: 'Adaugă pe ecranul principal',
    notNow: 'Nu acum',
  },
};

export function InstallPrompt({ language, onDone }: { language: Language; onDone: () => void }) {
  const install = deferred;
  const t = copy[language];

  if (!install) {
    return (
      <Screen
        title={t.title}
        text={t.manual}
        language={language}
        action={<TapButton onTap={onDone}>{t.done}</TapButton>}
      />
    );
  }

  return (
    <Screen
      title={t.title}
      text={t.text}
      language={language}
      action={
        <TapButton
          onTap={() => {
            deferred = undefined;
            install.prompt().then(onDone, onDone);
          }}
        >
          {t.add}
        </TapButton>
      }
      secondary={
        <TapButton variant="secondary" onTap={onDone}>
          {t.notNow}
        </TapButton>
      }
    />
  );
}
