import type { Suggestion, SuggestionEvidence, SuggestionKind, SuggestionStatus } from '@tempo/shared';
import type { BadgeTone } from '../ui/index.ts';
import { metricNames } from './metricNames.ts';

export const kindLabels: Record<SuggestionKind, string> = {
  review: 'Review',
  progression: 'Progression',
};

export const outcomeLabels: Record<SuggestionStatus, string> = {
  proposed: 'Open',
  accepted: 'Accepted',
  edited: 'Edited',
  dismissed: 'Dismissed',
};

export const outcomeTones: Record<SuggestionStatus, BadgeTone> = {
  proposed: 'warning',
  accepted: 'positive',
  edited: 'accent',
  dismissed: 'neutral',
};

export function newestFirst(suggestions: readonly Suggestion[]): Suggestion[] {
  return [...suggestions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export interface SuggestionGroups {
  open: Suggestion[];
  past: Suggestion[];
}

export function groupSuggestions(suggestions: readonly Suggestion[]): SuggestionGroups {
  const sorted = newestFirst(suggestions);
  return {
    open: sorted.filter((suggestion) => suggestion.status === 'proposed'),
    past: sorted.filter((suggestion) => suggestion.status !== 'proposed'),
  };
}

export type EvidenceTarget = { kind: 'internal'; to: string } | { kind: 'external'; href: string } | { kind: 'text' };

export function evidenceTarget(patientId: string, evidence: SuggestionEvidence): EvidenceTarget {
  if (evidence.metricId !== undefined) return { kind: 'internal', to: `/clinician/patients/${patientId}/metrics/${evidence.metricId}` };
  if (evidence.sessionId !== undefined) return { kind: 'internal', to: `/clinician/patients/${patientId}/sessions/${evidence.sessionId}` };
  if (evidence.sourceUrl !== undefined) return { kind: 'external', href: evidence.sourceUrl };
  return { kind: 'text' };
}

export function evidenceLabel(evidence: SuggestionEvidence): string {
  const { metricId, label } = evidence;
  if (metricId === undefined || !label.startsWith(metricId)) return label;
  return `${metricNames[metricId]}${label.slice(metricId.length)}`;
}

export function canSaveEdit(draft: string, original: string): boolean {
  const trimmed = draft.trim();
  return trimmed.length > 0 && trimmed !== original.trim();
}
