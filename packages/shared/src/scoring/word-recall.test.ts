import { describe, expect, it } from 'vitest';
import type { WordRecallRawResult } from '../activity.ts';
import { recalledWords, scoreWordRecall } from './word-recall.ts';

const words = ['horse', 'button', 'river', 'lemon', 'purple'];

const raw = (part: WordRecallRawResult['part']): WordRecallRawResult => ({
  part,
  language: 'en',
  words,
  presentedAt: '2026-11-14T10:00:00.000Z',
  recording: { id: 'r1', mimeType: 'audio/mp4', durationMs: 12000, bytes: 96000 },
});

describe('recalledWords', () => {
  it('matches in any order, ignoring case and punctuation', () => {
    expect(recalledWords(words, ['River,', 'um', 'HORSE.', 'purple'])).toEqual(['horse', 'river', 'purple']);
  });

  it('counts a repeated word once and ignores words not on the list', () => {
    expect(recalledWords(words, ['lemon', 'lemon', 'orange', 'lemons'])).toEqual(['lemon']);
  });

  it('ignores diacritics so a transcript without them still matches', () => {
    expect(recalledWords(['măr', 'pâine', 'ceaţă'], ['mar', 'paine', 'ceață'])).toEqual(['măr', 'pâine', 'ceaţă']);
  });

  it('returns nothing for silence', () => {
    expect(recalledWords(words, [])).toEqual([]);
  });
});

describe('scoreWordRecall', () => {
  it('feeds the metric of its part', () => {
    expect(scoreWordRecall(raw('immediate'), ['horse', 'button', 'river', 'lemon', 'purple'])).toEqual([
      { metricId: 'word-recall.immediate', value: 5, scoredBy: 'ai' },
    ]);
    expect(scoreWordRecall(raw('delayed'), ['button'])).toEqual([
      { metricId: 'word-recall.delayed', value: 1, scoredBy: 'ai' },
    ]);
  });
});
