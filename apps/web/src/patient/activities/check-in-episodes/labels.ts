import type { EpisodeType, Language } from '@tempo/shared';

export const episodeLabels: Record<Language, Record<EpisodeType, string>> = {
  en: {
    fall: 'A fall',
    dizziness: 'Dizziness',
    seizure: 'A seizure',
    freezing: 'Freezing, feet stuck to the floor',
    confusion: 'Confusion',
    spasm: 'Muscle spasms',
  },
  ro: {
    fall: 'O cădere',
    dizziness: 'Amețeală',
    seizure: 'O criză',
    freezing: 'Blocare, picioarele lipite de podea',
    confusion: 'Confuzie',
    spasm: 'Spasme musculare',
  },
};
