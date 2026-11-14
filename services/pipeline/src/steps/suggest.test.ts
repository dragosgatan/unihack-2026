import { describe, expect, it, vi } from 'vitest';
import type { Flag, MedicalRecord, Medication, ReliableChangeFlag } from '@tempo/shared';
import type { PublicData } from '@tempo/api/public-data';
import { createAi, createMockProvider, type AiProvider, type AiRequest } from '../ai/index.ts';
import { createPipelineAi } from '../ai-port.ts';
import type { CompareState } from '../state.ts';
import { attending, day, fixture, now, patient, submit } from '../testing.ts';
import { medicationChangesBefore, suggestionCandidates } from './medication-changes.ts';
import { matchLabelTerms, suggest } from './suggest.ts';

const at = '2026-11-13T12:00:00.000Z';

const medication = (fields: Partial<Medication> & Pick<Medication, 'id' | 'startDate'>): Medication => ({
  name: 'Levodopa/Carbidopa',
  rxnormId: '197444',
  dose: '100/25 mg',
  frequency: 'three times daily',
  ...fields,
});

const doseChange = [
  medication({ id: 'med-1', startDate: '2025-03-10', stopDate: '2026-10-02' }),
  medication({ id: 'med-2', startDate: '2026-10-02', frequency: 'four times daily' }),
];

const reliableChange = (fields: Partial<ReliableChangeFlag> = {}): ReliableChangeFlag => ({
  id: 'sess-1:finger-tapping.taps-per-second:right',
  patientId: patient.id,
  sessionId: 'sess-1',
  metricId: 'finger-tapping.taps-per-second',
  side: 'right',
  kind: 'reliable-change',
  value: 2,
  baseline: 4,
  createdAt: at,
  ...fields,
});

describe('medicationChangesBefore', () => {
  it('reads a stop and a start of the same drug on the same day as one dose change', () => {
    expect(medicationChangesBefore(doseChange, at)).toEqual([
      { medication: doseChange[1], kind: 'dose-changed', date: '2026-10-02' },
    ]);
  });

  it('keeps changes in the 56 days up to the session and drops older or later ones', () => {
    const medications = [
      medication({ id: 'inside', name: 'Ropinirole', rxnormId: '314208', startDate: '2026-09-18' }),
      medication({ id: 'too-old', name: 'Rasagiline', rxnormId: '608328', startDate: '2026-09-17' }),
      medication({ id: 'after', name: 'Amantadine', startDate: '2026-11-14' }),
      medication({ id: 'stopped', name: 'Clopidogrel', rxnormId: '309362', startDate: '2025-01-01', stopDate: '2026-11-13' }),
    ];
    expect(medicationChangesBefore(medications, at).map(({ medication: { id }, kind }) => [id, kind])).toEqual([
      ['inside', 'started'],
      ['stopped', 'stopped'],
    ]);
  });

  it('keeps a stop and a start of different drugs on the same day apart', () => {
    const medications = [
      medication({ id: 'old', name: 'Ropinirole', rxnormId: '314208', startDate: '2025-01-01', stopDate: '2026-10-02' }),
      medication({ id: 'new', name: 'Pramipexole', rxnormId: '859040', startDate: '2026-10-02' }),
    ];
    expect(medicationChangesBefore(medications, at).map(({ kind }) => kind).sort()).toEqual(['started', 'stopped']);
  });

  it('finds nothing when no medication changed', () => {
    expect(medicationChangesBefore([medication({ id: 'med-1', startDate: '2025-03-10' })], at)).toEqual([]);
    expect(medicationChangesBefore([], at)).toEqual([]);
  });
});

describe('suggestionCandidates', () => {
  it('pairs only reliable-change flags with the medication changes', () => {
    const skip: Flag = {
      id: 'sess-1:pain-skip:shoulder-raise',
      patientId: patient.id,
      sessionId: 'sess-1',
      kind: 'pain-skip',
      activityId: 'shoulder-raise',
      stage: 'task',
      createdAt: at,
    };
    const flag = reliableChange();
    expect(suggestionCandidates([skip, flag], doseChange, at)).toEqual([
      { flag, change: { medication: doseChange[1], kind: 'dose-changed', date: '2026-10-02' } },
    ]);
    expect(suggestionCandidates([skip], doseChange, at)).toEqual([]);
    expect(suggestionCandidates([flag], [], at)).toEqual([]);
  });
});

describe('matchLabelTerms', () => {
  const text =
    'Nervous System/Psychiatric: hallucinations, Confusion, dizziness, somnolence. The most common reactions were dyskinesias and gait disturbance.';

  it('finds cognition terms for cognitive metrics, in any case and plural', () => {
    expect(matchLabelTerms(text, 'cognition')).toEqual(['confusion', 'somnolence', 'dizziness', 'hallucination']);
  });

  it('finds movement terms for motor metrics', () => {
    expect(matchLabelTerms(text, 'movement')).toEqual(['dyskinesia', 'gait']);
  });

  it('matches whole words only and finds nothing in an unrelated label', () => {
    expect(matchLabelTerms('Reported: rash, nausea, headache, tremors', 'cognition')).toEqual([]);
    expect(matchLabelTerms('subgait regait', 'movement')).toEqual([]);
    expect(matchLabelTerms('muscle   weakness', 'movement')).toEqual(['muscle weakness']);
  });
});

const record: MedicalRecord = {
  patientId: patient.id,
  yearsOfEducation: 12,
  dominantHand: 'right',
  affectedLimbs: [],
  diagnoses: [{ code: 'G20', label: "Parkinson's disease" }],
  medications: doseChange,
  limitations: [],
  clinicalNotes: '',
  rehabGoals: [],
  timeline: [],
  updatedAt: at,
  updatedBy: attending.id,
};

const recordingProvider = () => {
  const requests: AiRequest[] = [];
  const inner = createMockProvider();
  const provider: AiProvider = {
    name: inner.name,
    generate: (request) => {
      requests.push(request);
      return inner.generate(request);
    },
  };
  return { provider, requests };
};

const flaggedSession = async (flags: Flag[] = [reliableChange()]) => {
  const context = await fixture();
  const { provider, requests } = recordingProvider();
  context.deps.ai = createPipelineAi(createAi({ provider, now: () => now }));
  await context.store.putRecord(record);
  await submit(context.store, 'sess-1', []);
  await context.store.putFlags(flags);
  const state: CompareState = {
    sessionId: 'sess-1',
    aiItems: [],
    comparisons: [
      {
        resultId: 'res-1',
        activityId: 'finger-tapping',
        metricId: 'finger-tapping.taps-per-second',
        side: 'right',
        value: 2,
        t: day(10),
        scoredBy: 'code',
        baseline: 4,
        referenceBand: { low: 3.5, high: 4.5 },
        previous: 2,
      },
    ],
  };
  return { ...context, requests, state };
};

describe('suggest', () => {
  it('writes one proposed review suggestion with the flag, the dose change and the label as evidence', async () => {
    const { store, deps, state, requests } = await flaggedSession();

    expect(await suggest(deps, state)).toEqual(state);

    const suggestions = await store.listSuggestions(patient.id);
    expect(suggestions).toHaveLength(1);
    const [suggestion] = suggestions;
    expect(suggestion).toMatchObject({
      id: expect.stringMatching(/^sugg-[0-9a-f]{24}$/),
      patientId: patient.id,
      kind: 'review',
      status: 'proposed',
      createdAt: now.toISOString(),
      ai: { model: 'mock', promptVersion: 'suggest-review-1' },
    });
    expect(suggestion?.text).toContain('consider review');
    expect(suggestion?.evidence).toEqual([
      {
        metricId: 'finger-tapping.taps-per-second',
        sessionId: 'sess-1',
        t: day(10),
        label: 'finger-tapping.taps-per-second (right): 2 taps/s, baseline 4 taps/s',
      },
      { t: '2026-10-02T00:00:00.000Z', label: 'Levodopa/Carbidopa dose or frequency changed to 100/25 mg four times daily' },
      {
        label: expect.stringMatching(/^Drug label \(CARBIDOPA AND LEVODOPA\) lists dyskinesia/),
        sourceUrl: 'https://api.fda.gov/drug/label.json?search=set_id:0215da3f-13a0-400d-ac2d-20c839bd89ef',
      },
    ]);

    expect(requests).toHaveLength(1);
    const sent = requests[0]?.parts.map((part) => ('text' in part ? part.text : '')).join('') ?? '';
    expect(JSON.parse(sent)).toEqual({
      metricId: 'finger-tapping.taps-per-second',
      side: 'right',
      direction: 'lower',
      value: 2,
      baseline: 4,
      sessionDate: '2026-11-10',
      medication: { name: 'Levodopa/Carbidopa', change: 'dose-changed', date: '2026-10-02' },
      labelTerms: expect.arrayContaining(['dyskinesia']),
    });
    for (const identifier of [patient.id, patient.name, patient.institutionPatientId, 'sess-1']) {
      expect(sent).not.toContain(identifier);
    }
    expect(requests[0]?.system).toContain('Never say or imply that the medication caused the change.');
    expect(requests[0]?.system).toContain('Romanian');
  });

  it('does not duplicate, overwrite a decision or ask the AI again when it runs twice', async () => {
    const { store, deps, state, requests } = await flaggedSession();
    await suggest(deps, state);
    const [first] = await store.listSuggestions(patient.id);
    const decided = await store.decideSuggestion(patient.id, first?.id ?? '', {
      status: 'dismissed',
      decidedBy: attending.id,
      decidedAt: now.toISOString(),
    });

    await suggest(deps, state);

    expect(await store.listSuggestions(patient.id)).toEqual([decided]);
    expect(requests).toHaveLength(1);
  });

  it('suggests nothing and does not fail when no label is available', async () => {
    const { store, deps, state, requests } = await flaggedSession();
    const noLabel: PublicData = {
      searchMedications: async () => ({ items: [], source: 'fallback' }),
      searchDiagnoses: async () => ({ items: [], source: 'fallback' }),
      drugLabel: vi.fn(async () => ({ label: undefined, source: 'fallback' as const })),
    };
    deps.publicData = noLabel;

    await expect(suggest(deps, state)).resolves.toEqual(state);

    expect(noLabel.drugLabel).toHaveBeenCalledTimes(1);
    expect(await store.listSuggestions(patient.id)).toEqual([]);
    expect(requests).toEqual([]);
  });

  it('suggests nothing when the label lists no term for the flagged domain', async () => {
    const { store, deps, state } = await flaggedSession();
    deps.publicData = {
      ...deps.publicData,
      drugLabel: async () => ({
        label: {
          name: 'EXAMPLE',
          setId: 'x',
          adverseReactions: 'Nausea, rash and headache.',
          warnings: '',
          sourceUrl: 'https://api.fda.gov/drug/label.json?search=set_id:x',
        },
        source: 'live',
      }),
    };
    await suggest(deps, state);
    expect(await store.listSuggestions(patient.id)).toEqual([]);
  });

  it('ignores skip flags and metrics outside cognition and movement', async () => {
    const skip: Flag = {
      id: 'sess-1:pain-skip:shoulder-raise',
      patientId: patient.id,
      sessionId: 'sess-1',
      kind: 'pain-skip',
      activityId: 'shoulder-raise',
      stage: 'task',
      createdAt: at,
    };
    const pain = reliableChange({ id: 'sess-1:pain.intensity:none', metricId: 'pain.intensity', value: 7, baseline: 2 });
    delete pain.side;
    const { store, deps, state, requests } = await flaggedSession([skip, pain]);
    const drugLabel = vi.fn(deps.publicData.drugLabel);
    deps.publicData = { ...deps.publicData, drugLabel };

    await suggest(deps, state);

    expect(await store.listSuggestions(patient.id)).toEqual([]);
    expect(drugLabel).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });
});
