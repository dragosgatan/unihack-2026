import { z } from 'zod';
import type { AiPart, AiProvider, AiTask } from './provider.ts';
import { suggestReviewSentSchema } from './suggest-review.ts';

export const mockModel = 'mock';

const canned: Record<Exclude<AiTask, 'session-summary' | 'suggestion'>, unknown> = {
  'clock-drawing': {
    contour: { score: 1, justification: 'The face is a closed, roughly circular line.' },
    numbers: { score: 1, justification: 'Numbers 1 to 12 are present and in order around the face.' },
    hands: { score: 0, justification: 'Both hands are the same length, so the time is ambiguous.' },
    confidence: 0.82,
  },
  speech: {
    transcript: 'apple, river, um, chair, garden',
    words: ['apple', 'river', 'um', 'chair', 'garden'],
  },
  'record-intake': {
    diagnoses: [
      { label: 'Cerebral infarction, unspecified', code: 'I63.9' },
      { label: 'Essential hypertension', code: 'I10' },
    ],
    medications: [
      { name: 'Aspirin', dose: '75 mg', frequency: 'once daily', startDate: '2026-10-02' },
      { name: 'Atorvastatin', dose: '40 mg', frequency: 'once daily at night' },
    ],
    historyNotes: ['Admitted with left-sided weakness.', 'Walks with a frame at discharge.'],
  },
  'episode-intake': {
    type: 'fall',
    when: 'Yesterday evening',
    severity: 'mild',
    circumstances: 'Lost balance while getting up from the sofa and sat down on the floor; got up without help.',
  },
};

const summaryInputSchema = z.object({
  scores: z.array(z.object({ metricId: z.string(), side: z.string().optional(), flagged: z.boolean() })),
  skipped: z.array(z.object({ activityId: z.string() })),
});

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

const summaryFrom = (parts: AiPart[]): unknown => {
  const text = parts.flatMap((part) => ('text' in part ? [part.text] : [])).join('');
  const { scores, skipped } = summaryInputSchema.parse(JSON.parse(text));
  const flagged = scores.filter((score) => score.flagged);
  return {
    summary: [
      `${plural(skipped.length, 'activity was', 'activities were')} skipped.`,
      `${plural(scores.length, 'score', 'scores')} recorded.`,
      `${plural(flagged.length, 'score is', 'scores are')} outside the patient's own range in two sessions in a row.`,
    ].join(' '),
    claims: flagged.map((score) => ({
      text: `${score.metricId}${score.side ? ` (${score.side})` : ''} is outside the own range.`,
      metricId: score.metricId,
    })),
  };
};

const textOf = (parts: AiPart[]): string => parts.flatMap((part) => ('text' in part ? [part.text] : [])).join('');

const changePhrases = {
  started: (name: string) => `starting ${name}`,
  stopped: (name: string) => `stopping ${name}`,
  'dose-changed': (name: string) => `a dose change of ${name}`,
};

const suggestionFrom = (parts: AiPart[]): unknown => {
  const { metricId, side, direction, value, baseline, sessionDate, medication, labelTerms } =
    suggestReviewSentSchema.parse(JSON.parse(textOf(parts)));
  const metric = `${metricId}${side ? ` (${side})` : ''}`;
  return {
    text: [
      `${metric} was ${direction} than its baseline on ${sessionDate} (${value} against ${baseline}).`,
      `This coincides with ${changePhrases[medication.change](medication.name)} on ${medication.date}, whose label lists ${labelTerms.join(', ')} — consider review.`,
    ].join(' '),
  };
};

export const createMockProvider = (): AiProvider => ({
  name: 'mock',
  generate: async ({ task, parts }) => ({
    data:
      task === 'session-summary'
        ? summaryFrom(parts)
        : task === 'suggestion'
          ? suggestionFrom(parts)
          : structuredClone(canned[task]),
    model: mockModel,
  }),
});
