import { useState } from 'react';
import type { ActivityModuleProps, EpisodesCheckIn as EpisodesAnswer, EpisodeType, Language, SessionPlanItem } from '@tempo/shared';
import { Choices } from '../../Choices.tsx';
import { episodeLabels } from './labels.ts';
import { canTranscribe } from '../../recognition.ts';
import { SpokenNote } from '../../SpokenNote.tsx';

type Episode = EpisodesAnswer['episodes'][number];
type Step = { kind: 'type' } | { kind: 'count'; type: EpisodeType } | { kind: 'note'; type: EpisodeType; count: number };

const en = {
  howMany: 'How many times?',
  tenOrMore: '10 or more',
  first: 'Since last time, have you had any of these?',
  more: 'Anything else since last time?',
  none: 'No, none of these',
  noMore: "No, that's all",
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    howMany: 'De câte ori?',
    tenOrMore: '10 sau mai multe',
    first: 'De data trecută, ați avut ceva din acestea?',
    more: 'Altceva de data trecută?',
    none: 'Nu, nimic din acestea',
    noMore: 'Nu, asta e tot',
  },
};

// shortcut: '10 or more' is stored as 10, so counts above 10 are a lower bound; add a number pad if clinicians need exact counts.
const counts = (language: Language): [number, string][] =>
  Array.from({ length: 10 }, (_, i) => [i + 1, i === 9 ? copy[language].tenOrMore : String(i + 1)]);

export function EpisodesCheckIn({ language, onComplete }: ActivityModuleProps<SessionPlanItem['config'], EpisodesAnswer>) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [step, setStep] = useState<Step>({ kind: 'type' });
  const t = copy[language];

  const add = (episode: Episode) => {
    setEpisodes([...episodes, episode]);
    setStep({ kind: 'type' });
  };

  if (step.kind === 'count') {
    return (
      <Choices
        title={t.howMany}
        language={language}
        options={counts(language)}
        layout="grid grid-cols-2"
        onPick={(count) => (canTranscribe() ? setStep({ kind: 'note', type: step.type, count }) : add({ type: step.type, count }))}
      />
    );
  }

  if (step.kind === 'note') {
    return <SpokenNote language={language} onDone={(description) => add({ type: step.type, count: step.count, description })} />;
  }

  const reported = new Set(episodes.map((episode) => episode.type));
  const remaining = (Object.keys(episodeLabels[language]) as EpisodeType[]).filter((type) => !reported.has(type));

  return (
    <Choices<EpisodeType | undefined>
      title={episodes.length ? t.more : t.first}
      language={language}
      options={[
        ...remaining.map((type): [EpisodeType, string] => [type, episodeLabels[language][type]]),
        [undefined, episodes.length ? t.noMore : t.none],
      ]}
      onPick={(type) => (type ? setStep({ kind: 'count', type }) : onComplete({ item: 'episodes', episodes }))}
    />
  );
}
