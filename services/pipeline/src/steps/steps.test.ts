import { describe, expect, it, vi } from 'vitest';
import type { SessionSummaryInput } from '../ai-port.ts';
import {
  allPoints,
  attending,
  day,
  fixture,
  history,
  now,
  painSkip,
  patient,
  rightTapsPerSecond,
  submit,
  tappingResult,
  tappingTrial,
} from '../testing.ts';
import { aiItems } from './ai-items.ts';
import { compare } from './compare.ts';
import { detectChange } from './detect-change.ts';
import { notify } from './notify.ts';
import { report } from './report.ts';
import { score } from './score.ts';

const tapsPerSecond = 'finger-tapping.taps-per-second';

describe('score', () => {
  it('stores code scores on the result and writes one point per metric and side', async () => {
    const { store, deps } = await fixture();
    const completedAt = day(10);
    await submit(store, 'sess-1', [
      tappingResult(completedAt, tappingTrial('right', 60, 250), tappingTrial('left', 30, 500)),
    ]);

    expect(await score(deps, { sessionId: 'sess-1' })).toEqual({ sessionId: 'sess-1' });

    const [result] = await store.listResults('sess-1');
    expect(result?.status === 'completed' && result.scores).toContainEqual({
      metricId: tapsPerSecond,
      side: 'right',
      value: 4,
      scoredBy: 'code',
    });
    expect(await allPoints(store, tapsPerSecond, 'right')).toEqual([{ t: completedAt, value: 4 }]);
    expect(await allPoints(store, tapsPerSecond, 'left')).toEqual([{ t: completedAt, value: 2 }]);
  });

  it('leaves a skipped result unscored and writes no point for it', async () => {
    const { store, deps } = await fixture();
    await submit(store, 'sess-1', [painSkip(day(10))]);

    await score(deps, { sessionId: 'sess-1' });

    const [result] = await store.listResults('sess-1');
    expect(result).not.toHaveProperty('scores');
    expect(await store.listLatest(patient.id)).toEqual([]);
  });

  it('gives the same scores and points when it runs twice and keeps scores from other raters', async () => {
    const { store, deps } = await fixture();
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 4)]);
    await score(deps, { sessionId: 'sess-1' });
    const [scored] = await store.listResults('sess-1');
    if (scored?.status !== 'completed') throw new Error('expected a completed result');
    const override = { metricId: tapsPerSecond, side: 'right', value: 3.9, scoredBy: 'clinician' } as const;
    await store.putResults('sess-1', [{ ...scored, scores: [...(scored.scores ?? []), override] }]);

    await score(deps, { sessionId: 'sess-1' });

    const [again] = await store.listResults('sess-1');
    expect(again?.status === 'completed' && again.scores).toEqual([override, ...(scored.scores ?? [])]);
    expect(await allPoints(store, tapsPerSecond, 'right')).toEqual([{ t: day(10), value: 4 }]);
  });
});

describe('aiItems', () => {
  it('asks the AI nothing when the session has no AI-scored activity', async () => {
    const { store, deps } = await fixture();
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 4), painSkip(day(10))]);
    const scoreItem = vi.spyOn(deps.ai, 'scoreItem');

    expect(await aiItems(deps, { sessionId: 'sess-1' })).toEqual({ sessionId: 'sess-1', aiItems: [] });
    expect(scoreItem).not.toHaveBeenCalled();
  });
});

describe('compare', () => {
  it('compares against the median of the first three points, the own range and the previous point', async () => {
    const { store, deps } = await fixture();
    await history(store, tapsPerSecond, 'right', [4.2, 3.8, 4.0, 2.5]);
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 2)]);
    await score(deps, { sessionId: 'sess-1' });

    const { comparisons } = await compare(deps, { sessionId: 'sess-1', aiItems: [] });

    expect(comparisons.find((comparison) => comparison.metricId === tapsPerSecond)).toEqual({
      resultId: expect.any(String),
      activityId: 'finger-tapping',
      metricId: tapsPerSecond,
      side: 'right',
      value: 2,
      t: day(10),
      scoredBy: 'code',
      baseline: 4,
      referenceBand: { low: 3.6, high: 4.4 },
      previous: 2.5,
    });
  });

  it('uses the clinician baseline in force on the day of the session', async () => {
    const { store, deps } = await fixture();
    await history(store, tapsPerSecond, 'right', [4.2, 3.8, 4.0]);
    const set = { patientId: patient.id, metricId: tapsPerSecond, side: 'right', source: 'clinician' } as const;
    await store.putBaseline({ ...set, id: 'base-1', value: 3, from: day(5), reason: 'After surgery', setBy: attending.id });
    await store.putBaseline({ ...set, id: 'base-2', value: 5, from: day(20), reason: 'Later reset', setBy: attending.id });
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 2)]);
    await score(deps, { sessionId: 'sess-1' });

    const { comparisons } = await compare(deps, { sessionId: 'sess-1', aiItems: [] });

    expect(comparisons.find((comparison) => comparison.metricId === tapsPerSecond)?.baseline).toBe(3);
  });
});

describe('detectChange', () => {
  const flagsAfter = async (earlier: number[], current: 2 | 4 | 6) => {
    const { store, deps } = await fixture();
    await history(store, tapsPerSecond, 'right', earlier);
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), current)]);
    await score(deps, { sessionId: 'sess-1' });
    await detectChange(deps, await compare(deps, { sessionId: 'sess-1', aiItems: [] }));
    return (await store.listFlags(patient.id, 'sess-1')).filter((flag) => flag.metricId === tapsPerSecond);
  };

  it('does not flag a single bad day', async () => {
    expect(await flagsAfter([4, 4, 4], 2)).toEqual([]);
  });

  it('flags two sessions in a row outside the own range in the worse direction', async () => {
    expect(await flagsAfter([4, 4, 4, 2], 2)).toEqual([
      {
        id: `sess-1:${tapsPerSecond}:right`,
        patientId: patient.id,
        sessionId: 'sess-1',
        metricId: tapsPerSecond,
        side: 'right',
        kind: 'reliable-change',
        value: 2,
        baseline: 4,
        createdAt: now.toISOString(),
      },
    ]);
  });

  it('does not flag an improvement', async () => {
    expect(await flagsAfter([4, 4, 4, 6], 6)).toEqual([]);
  });

  it('does not flag before a baseline exists', async () => {
    expect(await flagsAfter([2], 2)).toEqual([]);
  });

  it('writes the same single flag when it runs twice', async () => {
    const { store, deps } = await fixture();
    await history(store, tapsPerSecond, 'right', [4, 4, 4, 2]);
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 2)]);
    await score(deps, { sessionId: 'sess-1' });
    const compared = await compare(deps, { sessionId: 'sess-1', aiItems: [] });
    await detectChange(deps, compared);
    await detectChange(deps, compared);
    expect(await store.listFlags(patient.id, 'sess-1')).toHaveLength(1);
  });
});

describe('report', () => {
  it('stores skips first, scores with baseline and flag, and a labelled AI summary from de-identified input', async () => {
    const { store, deps } = await fixture();
    await history(store, tapsPerSecond, 'right', [4, 4, 4, 2]);
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 2), painSkip(day(10, 11))]);
    const summarize = vi.spyOn(deps.ai, 'summarizeSession');
    await score(deps, { sessionId: 'sess-1' });
    const compared = await compare(deps, { sessionId: 'sess-1', aiItems: [] });
    await detectChange(deps, compared);

    expect(await report(deps, compared)).toEqual({ sessionId: 'sess-1' });

    const stored = await store.getReport('sess-1');
    expect(stored?.skipped).toEqual([
      {
        resultId: expect.any(String),
        activityId: 'shoulder-raise',
        reason: 'pain',
        stage: 'task',
        skippedAt: day(10, 11),
        painLocation: 'right-shoulder',
      },
    ]);
    expect(stored?.scores.find((entry) => entry.metricId === tapsPerSecond)).toMatchObject({
      side: 'right',
      value: 2,
      unit: 'taps/s',
      baseline: 4,
      referenceBand: { low: 3.6, high: 4.4 },
      flagged: true,
    });
    expect(stored?.aiSummary).toMatchObject({
      label: 'ai-generated',
      ai: { model: 'mock', promptVersion: expect.any(String), inputRef: 'session:sess-1', provider: 'mock' },
    });
    expect(stored?.aiSummary.claims).toEqual([{ text: expect.any(String), metricId: tapsPerSecond }]);

    const [input] = summarize.mock.calls[0] ?? [];
    const sent = JSON.stringify(input satisfies SessionSummaryInput | undefined);
    expect(input?.language).toBe('ro');
    expect(sent).not.toContain(patient.id);
    expect(sent).not.toContain(patient.name);
    expect(sent).not.toContain(patient.institutionPatientId);
    expect(sent).not.toContain('right-shoulder');
  });

  it('keeps the first report and does not ask the AI again', async () => {
    const { store, deps } = await fixture();
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 4)]);
    const compared = await compare(deps, { sessionId: 'sess-1', aiItems: [] });
    await report(deps, compared);
    const first = await store.getReport('sess-1');
    const summarize = vi.spyOn(deps.ai, 'summarizeSession');

    await report(deps, compared);

    expect(summarize).not.toHaveBeenCalled();
    expect(await store.getReport('sess-1')).toEqual(first);
  });
});

describe('notify', () => {
  const reported = async (results: Parameters<typeof submit>[2]) => {
    const context = await fixture();
    await submit(context.store, 'sess-1', results);
    await report(context.deps, await compare(context.deps, { sessionId: 'sess-1', aiItems: [] }));
    return context;
  };

  it('emails the attending a link to the session without patient details and marks the session processed', async () => {
    const { store, deps, emails } = await reported([rightTapsPerSecond(day(10), 4)]);

    expect(await notify(deps, { sessionId: 'sess-1' })).toEqual({
      sessionId: 'sess-1',
      status: 'processed',
      notified: true,
    });

    expect(emails).toHaveLength(1);
    expect(emails[0]?.to).toBe(attending.email);
    expect(emails[0]?.text).toContain('https://tempo.example.test/clinician/sessions/sess-1');
    expect(JSON.stringify(emails)).not.toContain(patient.name);
    expect(JSON.stringify(emails)).not.toContain(patient.institutionPatientId);
    expect((await store.getSession('sess-1'))?.status).toBe('processed');
  });

  it('marks a session with a skipped activity as completed with skips', async () => {
    const { store, deps } = await reported([rightTapsPerSecond(day(10), 4), painSkip(day(10))]);
    expect((await notify(deps, { sessionId: 'sess-1' })).status).toBe('completed-with-skips');
    expect((await store.getSession('sess-1'))?.status).toBe('completed-with-skips');
  });

  it('sends the email once when it runs twice', async () => {
    const { deps, emails } = await reported([rightTapsPerSecond(day(10), 4)]);
    await notify(deps, { sessionId: 'sess-1' });
    await notify(deps, { sessionId: 'sess-1' });
    expect(emails).toHaveLength(1);
  });

  it('fails while there is no report yet so the step is retried', async () => {
    const { store, deps } = await fixture();
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 4)]);
    await expect(notify(deps, { sessionId: 'sess-1' })).rejects.toThrow(/no report/);
  });
});
