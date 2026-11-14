import { describe, expect, it } from 'vitest';
import type { SubmittedResult } from '@tempo/shared';
import { runPipeline } from '../run.ts';
import { allPoints, day, fixture, history, patient, skip, submit } from '../testing.ts';
import { score } from './score.ts';

const pain = (completedAt: string, intensity: number): SubmittedResult => ({
  status: 'completed',
  completedAt,
  raw: { activityId: 'check-in-pain', data: { item: 'pain', intensity, location: 'back', type: 'ache' } },
});

const medication = (completedAt: string, ...statuses: ('taken' | 'missed' | 'stopped')[]): SubmittedResult => ({
  status: 'completed',
  completedAt,
  raw: {
    activityId: 'check-in-medication',
    data: {
      item: 'medication',
      medications: statuses.map((status, index) => ({ medicationId: `med-${index}`, name: `Drug ${index}`, status })),
    },
  },
});

const episodes = (completedAt: string, ...counts: number[]): SubmittedResult => ({
  status: 'completed',
  completedAt,
  raw: {
    activityId: 'check-in-episodes',
    data: { item: 'episodes', episodes: counts.map((count) => ({ type: 'freezing' as const, count })) },
  },
});

describe('check-in scoring in the score step', () => {
  it('scores pain, adherence and episodes in code and writes a point at the answer time', async () => {
    const { store, deps } = await fixture();
    await submit(store, 'sess-1', [pain(day(10, 9), 4), medication(day(10, 9), 'taken', 'missed', 'stopped'), episodes(day(10, 9), 2, 1)]);

    await score(deps, { sessionId: 'sess-1' });

    const results = await store.listResults('sess-1');
    expect(results.map((result) => (result.status === 'completed' ? result.scores : undefined))).toEqual([
      [{ metricId: 'pain.intensity', value: 4, scoredBy: 'code' }],
      [{ metricId: 'medication.adherence', value: 50, scoredBy: 'code' }],
      [{ metricId: 'episodes.count', value: 3, scoredBy: 'code' }],
    ]);
    expect(await allPoints(store, 'pain.intensity', undefined)).toEqual([{ t: day(10, 9), value: 4, sessionId: 'sess-1' }]);
    expect(await allPoints(store, 'medication.adherence', undefined)).toEqual([{ t: day(10, 9), value: 50, sessionId: 'sess-1' }]);
    expect(await allPoints(store, 'episodes.count', undefined)).toEqual([{ t: day(10, 9), value: 3, sessionId: 'sess-1' }]);
  });

  it('writes no adherence point when every drug was stopped', async () => {
    const { store, deps } = await fixture();
    await submit(store, 'sess-1', [medication(day(10, 9), 'stopped')]);
    await score(deps, { sessionId: 'sess-1' });
    expect(await allPoints(store, 'medication.adherence', undefined)).toEqual([]);
  });

  it('never scores a skipped check-in, writes no point for it and leaves the baseline alone', async () => {
    const { store, deps } = await fixture();
    await history(store, 'pain.intensity', undefined, [2, 3, 2]);
    await submit(store, 'sess-1', [skip('check-in-pain', 'tired', day(10, 9)), skip('check-in-episodes', 'other', day(10, 9))], {
      createdAt: day(10),
      submittedAt: day(10, 12),
    });

    await runPipeline(deps, { sessionId: 'sess-1' });

    const results = await store.listResults('sess-1');
    expect(results.every((result) => result.status === 'skipped' && !('scores' in result))).toBe(true);
    expect((await allPoints(store, 'pain.intensity', undefined)).map((point) => point.value)).toEqual([2, 3, 2]);
    expect(await allPoints(store, 'episodes.count', undefined)).toEqual([]);
    expect(await store.latestBaseline(patient.id, 'pain.intensity', undefined)).toBeUndefined();
  });

  it('flags pain only when two answers in a row are above the own range, not on a single high answer', async () => {
    const { store, deps } = await fixture();
    await history(store, 'pain.intensity', undefined, [2, 2, 2]);

    await submit(store, 'sess-1', [pain(day(10, 9), 8)], { createdAt: day(10), submittedAt: day(10, 12) });
    await runPipeline(deps, { sessionId: 'sess-1' });
    expect(await store.listFlags(patient.id, 'sess-1')).toEqual([]);

    await submit(store, 'sess-2', [pain(day(12, 9), 7)], { createdAt: day(12), submittedAt: day(12, 12) });
    await runPipeline(deps, { sessionId: 'sess-2' });
    expect(await store.listFlags(patient.id, 'sess-2')).toMatchObject([
      { kind: 'reliable-change', metricId: 'pain.intensity', value: 7, baseline: 2 },
    ]);
    expect(await store.listSuggestions(patient.id)).toEqual([]);
  });
});
