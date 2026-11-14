import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { EpisodeType, Language } from '@tempo/shared';
import { episodeLabels } from '../activities/check-in-episodes/labels.ts';
import { Choices } from '../Choices.tsx';
import { canTranscribe } from '../recognition.ts';
import { Screen } from '../Screen.tsx';
import { queueEpisode, syncEpisodes } from '../session/store.ts';
import { SpokenNote } from '../SpokenNote.tsx';
import { TapButton } from '../TapButton.tsx';
import { homePath, type HomeDevice } from './data.ts';


const en = {
  thanks: 'Thank you',
  failed: 'That did not save',
  saved: "We'll let your therapist know.",
  tell: 'Please tell your therapist what happened.',
  done: 'Done',
  what: 'What happened?',
  back: 'Nothing, go back',
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    thanks: 'Vă mulțumim',
    failed: 'Nu s-a salvat',
    saved: 'Îi vom spune terapeutului.',
    tell: 'Vă rugăm să-i spuneți terapeutului ce s-a întâmplat.',
    done: 'Gata',
    what: 'Ce s-a întâmplat?',
    back: 'Nimic, înapoi',
  },
};

export function LogEpisode({ device }: { device: HomeDevice }) {
  const navigate = useNavigate();
  const [type, setType] = useState<EpisodeType>();
  const [outcome, setOutcome] = useState<'saved' | 'failed'>();
  const language = device.language;
  const t = copy[language];
  const back = () => navigate(homePath);

  const save = (episode: EpisodeType, description?: string) => {
    const body = { id: crypto.randomUUID(), type: episode, count: 1, occurredAt: new Date().toISOString(), description };
    queueEpisode({ token: device.token, body }).then(
      () => {
        setOutcome('saved');
        syncEpisodes().catch(console.error);
      },
      (error: unknown) => {
        console.error(error);
        setOutcome('failed');
      },
    );
  };

  if (outcome) {
    return (
      <Screen
        title={outcome === 'saved' ? t.thanks : t.failed}
        text={outcome === 'saved' ? t.saved : t.tell}
        language={language}
        action={<TapButton onTap={back}>{t.done}</TapButton>}
      />
    );
  }

  if (type) return <SpokenNote language={language} onDone={(note) => save(type, note)} />;

  return (
    <Choices<EpisodeType | undefined>
      title={t.what}
      language={language}
      options={[...(Object.entries(episodeLabels[language]) as [EpisodeType, string][]), [undefined, t.back]]}
      onPick={(picked) => (picked === undefined ? back() : canTranscribe() ? setType(picked) : save(picked))}
    />
  );
}
