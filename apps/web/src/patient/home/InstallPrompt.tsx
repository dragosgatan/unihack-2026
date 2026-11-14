import type { Language } from '@tempo/shared';
import { browserLanguage } from '../feedback.ts';
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
  firstTitle: 'First add Tempo to your home screen',
  first: (code: string) =>
    `Tap the Share button, then Add to Home Screen. Open Tempo from the new icon and type your code there${code ? `: ${code.split('').join(' ')}` : ''}.`,
  stay: 'Use Tempo in this browser',
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
    firstTitle: 'Mai întâi adăugați Tempo pe ecranul principal',
    first: (code) =>
      `Atingeți butonul Partajare, apoi Adaugă pe ecranul principal. Deschideți Tempo din noua pictogramă și introduceți acolo codul${code ? `: ${code.split('').join(' ')}` : ''}.`,
    stay: 'Folosesc Tempo în acest browser',
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

export function InstallFirst({ code, onStay }: { code: string; onStay: () => void }) {
  const language = browserLanguage();
  const t = copy[language];
  return (
    <Screen
      title={t.firstTitle}
      text={t.first(code)}
      language={language}
      action={
        <TapButton variant="secondary" onTap={onStay}>
          {t.stay}
        </TapButton>
      }
    />
  );
}
