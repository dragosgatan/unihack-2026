import type { Suggestion } from '@tempo/shared';
import type { SuggestionDecision } from './types.ts';

export const newestFirst = (a: Suggestion, b: Suggestion): number =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export const withDecision = (suggestion: Suggestion, { status, editedText, decidedBy, decidedAt }: SuggestionDecision): Suggestion => {
  const decided: Suggestion = { ...suggestion, status, decidedBy, decidedAt };
  if (editedText === undefined) delete decided.editedText;
  else decided.editedText = editedText;
  return decided;
};
