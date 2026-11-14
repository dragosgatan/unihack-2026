import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { EpisodeType } from '@tempo/shared';
import { episodeLabels } from '../activities/check-in-episodes/labels.ts';
import { Choices } from '../Choices.tsx';
import { canTranscribe } from '../recognition.ts';
import { Screen } from '../Screen.tsx';
import { queueEpisode, syncEpisodes } from '../session/store.ts';
import { SpokenNote } from '../SpokenNote.tsx';
import { TapButton } from '../TapButton.tsx';
import { homePath, type HomeDevice } from './data.ts';


export function LogEpisode({ device }: { device: HomeDevice }) {
  const navigate = useNavigate();
  const [type, setType] = useState<EpisodeType>();
  const [outcome, setOutcome] = useState<'saved' | 'failed'>();
  const language = device.language;
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
        title={outcome === 'saved' ? 'Thank you' : 'That did not save'}
        text={outcome === 'saved' ? "We'll let your therapist know." : 'Please tell your therapist what happened.'}
        language={language}
        action={<TapButton onTap={back}>Done</TapButton>}
      />
    );
  }

  if (type) return <SpokenNote language={language} onDone={(note) => save(type, note)} />;

  return (
    <Choices<EpisodeType | undefined>
      title="What happened?"
      language={language}
      options={[...(Object.entries(episodeLabels) as [EpisodeType, string][]), [undefined, 'Nothing, go back']]}
      onPick={(picked) => (picked === undefined ? back() : canTranscribe() ? setType(picked) : save(picked))}
    />
  );
}
