import { createHash } from 'node:crypto';
import {
  metricDefinitions,
  type MetricId,
  type ReliableChangeFlag,
  type Suggestion,
  type SuggestionEvidence,
} from '@tempo/shared';
import type { LabelLookup } from '@tempo/api/public-data';
import { requireSession, type PipelineDeps } from '../ports.ts';
import type { CompareState } from '../state.ts';
import { suggestionCandidates, type MedicationChange } from './medication-changes.ts';

export type LabelDomain = 'cognition' | 'movement';

const metricDomains: Partial<Record<MetricId, LabelDomain>> = {
  'trail-making-a.time': 'cognition',
  'trail-making-a.errors': 'cognition',
  'trail-making-b.time': 'cognition',
  'trail-making-b.errors': 'cognition',
  'clock-drawing.score': 'cognition',
  'word-recall.immediate': 'cognition',
  'word-recall.delayed': 'cognition',
  'finger-tapping.taps-per-second': 'movement',
  'finger-tapping.variability': 'movement',
  'finger-tapping.decrement': 'movement',
  'spiral-tracing.deviation': 'movement',
  'spiral-tracing.tremor-frequency': 'movement',
  'spiral-tracing.speed': 'movement',
  'shoulder-raise.peak-angle': 'movement',
  'shoulder-raise.repetitions': 'movement',
  'shoulder-raise.smoothness': 'movement',
  'sit-to-stand.count': 'movement',
  'sit-to-stand.time-per-repetition': 'movement',
  'single-leg-squat.depth': 'movement',
  'single-leg-squat.knee-angle': 'movement',
  'single-leg-squat.knee-valgus': 'movement',
  'single-leg-squat.symmetry': 'movement',
};

export const domainOf = (metricId: MetricId): LabelDomain | undefined => metricDomains[metricId];

const domainTerms: Record<LabelDomain, readonly string[]> = {
  cognition: [
    'confusion',
    'confusional state',
    'disorientation',
    'delirium',
    'somnolence',
    'drowsiness',
    'sedation',
    'lethargy',
    'dizziness',
    'hallucination',
    'memory impairment',
    'amnesia',
    'cognitive impairment',
    'disturbance in attention',
    'impaired concentration',
  ],
  movement: [
    'dyskinesia',
    'tremor',
    'ataxia',
    'muscle weakness',
    'rigidity',
    'bradykinesia',
    'extrapyramidal',
    'incoordination',
    'abnormal coordination',
    'gait',
    'dystonia',
    'akathisia',
    'balance disorder',
  ],
};

const termPattern = (term: string): RegExp => new RegExp(`\\b${term.replace(/ /g, '\\s+')}(?:s|es)?\\b`, 'i');

export const matchLabelTerms = (text: string, domain: LabelDomain): string[] =>
  domainTerms[domain].filter((term) => termPattern(term).test(text));

export const suggestionId = (flag: Pick<ReliableChangeFlag, 'metricId' | 'side'>, change: MedicationChange): string =>
  `sugg-${createHash('sha256')
    .update(`${flag.metricId}|${flag.side ?? 'none'}|${change.medication.id}|${change.date}`)
    .digest('hex')
    .slice(0, 24)}`;

const dateTime = (date: string): string => `${date}T00:00:00.000Z`;

const metricLabel = (flag: ReliableChangeFlag): string => {
  const { unit } = metricDefinitions[flag.metricId];
  const side = flag.side ? ` (${flag.side})` : '';
  return `${flag.metricId}${side}: ${flag.value} ${unit}, baseline ${flag.baseline} ${unit}`;
};

const changeLabel = ({ medication, kind }: MedicationChange): string => {
  const regimen = `${medication.dose} ${medication.frequency}`;
  if (kind === 'stopped') return `${medication.name} stopped`;
  if (kind === 'started') return `${medication.name} started at ${regimen}`;
  return `${medication.name} dose or frequency changed to ${regimen}`;
};

export const suggest = async ({ store, ai, publicData, clock }: PipelineDeps, state: CompareState): Promise<CompareState> => {
  const session = await requireSession(store, state.sessionId);
  const [flags, detail] = await Promise.all([
    store.listFlags(session.patientId, session.id),
    store.getPatientDetail(session.patientId),
  ]);
  const sessionAt = session.submittedAt ?? session.createdAt;
  const candidates = suggestionCandidates(flags, detail?.record?.medications ?? [], sessionAt);
  const labels = new Map<string, Promise<LabelLookup>>();

  for (const { flag, change } of candidates) {
    const domain = domainOf(flag.metricId);
    const id = suggestionId(flag, change);
    if (!domain || (await store.getSuggestion(session.patientId, id))) continue;

    const { medication } = change;
    const lookup = labels.get(medication.id) ?? publicData.drugLabel(medication);
    labels.set(medication.id, lookup);
    const { label } = await lookup;
    const terms = label ? matchLabelTerms(`${label.adverseReactions}\n${label.warnings}`, domain) : [];
    if (!label || terms.length === 0) continue;

    const measuredAt =
      state.comparisons.find((comparison) => comparison.metricId === flag.metricId && comparison.side === flag.side)?.t ??
      sessionAt;
    const { output, meta } = await ai.suggestReview({
      suggestionId: id,
      language: detail?.plan?.language ?? 'en',
      metricId: flag.metricId,
      ...(flag.side ? { side: flag.side } : {}),
      direction: flag.value > flag.baseline ? 'higher' : 'lower',
      value: flag.value,
      baseline: flag.baseline,
      sessionDate: measuredAt.slice(0, 10),
      medication: { name: medication.name, change: change.kind, date: change.date },
      labelTerms: terms,
    });

    const evidence: SuggestionEvidence[] = [
      { metricId: flag.metricId, sessionId: session.id, t: measuredAt, label: metricLabel(flag) },
      { t: dateTime(change.date), label: changeLabel(change) },
      { label: `Drug label (${label.name}) lists ${terms.join(', ')}`, sourceUrl: label.sourceUrl },
    ];
    const suggestion: Suggestion = {
      id,
      patientId: session.patientId,
      kind: 'review',
      text: output.text,
      evidence,
      status: 'proposed',
      createdAt: clock().toISOString(),
      ai: { model: meta.model, promptVersion: meta.promptVersion, inputRef: meta.inputRef },
    };
    await store.createSuggestion(suggestion);
  }
  return state;
};
