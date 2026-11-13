import { describe, expect, it } from 'vitest';
import { runPipeline } from './run.ts';
import { allPoints, day, fixture, history, painSkip, patient, rightTapsPerSecond, submit } from './testing.ts';

const tapsPerSecond = 'finger-tapping.taps-per-second';

describe('runPipeline', () => {
  it('scores, flags, reports and notifies a submitted session', async () => {
    const { store, deps, emails } = await fixture();
    await history(store, tapsPerSecond, 'right', [4, 4, 4, 2]);
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 2), painSkip(day(10, 11))]);

    expect(await runPipeline(deps, { sessionId: 'sess-1' })).toEqual({
      sessionId: 'sess-1',
      status: 'completed-with-skips',
      notified: true,
    });

    expect((await allPoints(store, tapsPerSecond, 'right')).at(-1)).toEqual({ t: day(10), value: 2 });
    expect((await store.listFlags(patient.id, 'sess-1')).map((flag) => flag.kind).sort()).toEqual([
      'pain-skip',
      'reliable-change',
    ]);
    expect((await store.getReport('sess-1'))?.skipped).toHaveLength(1);
    expect(emails.map((email) => email.subject)).toEqual([
      'Tempo: an activity was stopped because of pain',
      'Tempo: a session report is ready',
    ]);
  });

  it('gives the same flags, one pain email and one report when a session with skips runs twice', async () => {
    const { store, deps, emails } = await fixture();
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 4), painSkip(day(10, 11))]);
    await runPipeline(deps, { sessionId: 'sess-1' });
    const first = { flags: await store.listFlags(patient.id, 'sess-1'), report: await store.getReport('sess-1') };

    await runPipeline(deps, { sessionId: 'sess-1' });

    expect(await store.listFlags(patient.id, 'sess-1')).toEqual(first.flags);
    expect(await store.getReport('sess-1')).toEqual(first.report);
    expect(first.report?.attention.map((flag) => flag.kind)).toEqual(['pain-skip']);
    expect(emails.filter((email) => email.subject.includes('pain'))).toHaveLength(1);
    expect(emails).toHaveLength(2);
    expect((await store.getSession('sess-1'))?.status).toBe('completed-with-skips');
  });

  it('ends a session without skips as processed', async () => {
    const { store, deps } = await fixture();
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 4)]);
    await runPipeline(deps, { sessionId: 'sess-1' });
    expect((await store.getSession('sess-1'))?.status).toBe('processed');
  });

  it('changes nothing when the whole pipeline runs again', async () => {
    const { store, deps, emails } = await fixture();
    await history(store, tapsPerSecond, 'right', [4, 4, 4, 2]);
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 2)]);
    await runPipeline(deps, { sessionId: 'sess-1' });
    const snapshot = async () => ({
      points: await allPoints(store, tapsPerSecond, 'right'),
      latest: await store.listLatest(patient.id),
      results: await store.listResults('sess-1'),
      flags: await store.listFlags(patient.id, 'sess-1'),
      report: await store.getReport('sess-1'),
      session: await store.getSession('sess-1'),
    });
    const first = await snapshot();

    await runPipeline(deps, { sessionId: 'sess-1' });

    expect(await snapshot()).toEqual(first);
    expect(first.points).toHaveLength(5);
    expect(emails).toHaveLength(1);
  });

  it('writes no point for a session where everything was skipped', async () => {
    const { store, deps } = await fixture();
    await submit(store, 'sess-1', [painSkip(day(10))]);

    await runPipeline(deps, { sessionId: 'sess-1' });

    expect(await store.listLatest(patient.id)).toEqual([]);
    expect((await store.getReport('sess-1'))?.scores).toEqual([]);
    expect((await store.getSession('sess-1'))?.status).toBe('completed-with-skips');
  });
});
