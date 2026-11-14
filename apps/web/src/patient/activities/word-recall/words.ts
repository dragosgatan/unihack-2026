import type { Language } from '@tempo/shared';

export const practiceWords: Record<Language, string[]> = {
  en: ['cup', 'tree'],
  ro: ['cană', 'copac'],
};

export const wordLists: Record<Language, string[][]> = {
  en: [
    ['horse', 'button', 'river', 'lemon', 'purple'],
    ['tiger', 'blanket', 'castle', 'carrot', 'silver'],
    ['rabbit', 'hammer', 'garden', 'cherry', 'yellow'],
    ['eagle', 'candle', 'bridge', 'onion', 'green'],
    ['sheep', 'mirror', 'forest', 'bread', 'brown'],
  ],
  ro: [
    ['cal', 'nasture', 'râu', 'lămâie', 'violet'],
    ['tigru', 'pătură', 'castel', 'morcov', 'argintiu'],
    ['iepure', 'ciocan', 'grădină', 'cireașă', 'galben'],
    ['vultur', 'lumânare', 'munte', 'ceapă', 'verde'],
    ['oaie', 'oglindă', 'pădure', 'pâine', 'maro'],
  ],
};
