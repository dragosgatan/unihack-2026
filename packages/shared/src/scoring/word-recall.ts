import type { WordRecallRawResult } from '../activity.ts';
import type { Score } from '../session.ts';

const normalized = (word: string) =>
  word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

export const recalledWords = (list: string[], spoken: string[]): string[] => {
  const heard = new Set(spoken.map(normalized));
  return list.filter((word) => heard.has(normalized(word)));
};

export const scoreWordRecall = ({ part, words }: WordRecallRawResult, spoken: string[]): Score[] => [
  { metricId: `word-recall.${part}`, value: recalledWords(words, spoken).length, scoredBy: 'ai' },
];
