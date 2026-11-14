import { useState } from 'react';
import type { ActivityModuleProps, EpisodesCheckIn as EpisodesAnswer, EpisodeType, SessionPlanItem } from '@tempo/shared';
import { Choices } from '../../Choices.tsx';
import { episodeLabels } from './labels.ts';
import { canTranscribe } from '../../recognition.ts';
import { SpokenNote } from '../../SpokenNote.tsx';

type Episode = EpisodesAnswer['episodes'][number];
type Step = { kind: 'type' } | { kind: 'count'; type: EpisodeType } | { kind: 'note'; type: EpisodeType; count: number };

// shortcut: '10 or more' is stored as 10, so counts above 10 are a lower bound; add a number pad if clinicians need exact counts.
const counts: [number, string][] = Array.from({ length: 10 }, (_, i) => [i + 1, i === 9 ? '10 or more' : String(i + 1)]);

export function EpisodesCheckIn({ language, onComplete }: ActivityModuleProps<SessionPlanItem['config'], EpisodesAnswer>) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [step, setStep] = useState<Step>({ kind: 'type' });

  const add = (episode: Episode) => {
    setEpisodes([...episodes, episode]);
    setStep({ kind: 'type' });
  };

  if (step.kind === 'count') {
    return (
      <Choices
        title="How many times?"
        language={language}
        options={counts}
        layout="grid grid-cols-2"
        onPick={(count) => (canTranscribe() ? setStep({ kind: 'note', type: step.type, count }) : add({ type: step.type, count }))}
      />
    );
  }

  if (step.kind === 'note') {
    return <SpokenNote language={language} onDone={(description) => add({ type: step.type, count: step.count, description })} />;
  }

  const reported = new Set(episodes.map((episode) => episode.type));
  const remaining = (Object.keys(episodeLabels) as EpisodeType[]).filter((type) => !reported.has(type));

  return (
    <Choices<EpisodeType | undefined>
      title={episodes.length ? 'Anything else since last time?' : 'Since last time, have you had any of these?'}
      language={language}
      options={[
        ...remaining.map((type): [EpisodeType, string] => [type, episodeLabels[type]]),
        [undefined, episodes.length ? "No, that's all" : 'No, none of these'],
      ]}
      onPick={(type) => (type ? setStep({ kind: 'count', type }) : onComplete({ item: 'episodes', episodes }))}
    />
  );
}
