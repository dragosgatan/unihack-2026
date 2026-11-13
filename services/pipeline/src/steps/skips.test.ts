import { describe, expect, it } from 'vitest';
import type { Session, SubmittedResult } from '@tempo/shared';
import { runPipeline } from '../run.ts';
import {
  attending,
  day,
  fixture,
  history,
  now,
  painSkip,
  patient,
  rightTapsPerSecond,
  skip,
  submit,
  type Fixture,
} from '../testing.ts';
import { compare } from './compare.ts';
import { detectChange, previousSession } from './detect-change.ts';
import { score } from './score.ts';

const tapsPerSecond = 'finger-tapping.taps-per-second';
const painSubject = 'Tempo: an activity was stopped because of pain';

const sitToStandPain: SubmittedResult = {
  status: 'skipped',
  activityId: 'sit-to-stand',
  reason: 'pain',
  stage: 'instructions',
  skippedAt: day(10, 11),
};

const runSession = async ({ store, deps }: Fixture, sessionId: string, dayOfMonth: number, results: SubmittedResult[]) => {
  await submit(store, sessionId, results, { createdAt: day(dayOfMonth), submittedAt: day(dayOfMonth, 12) });
  await runPipeline(deps, { sessionId });
  return store.listFlags(patient.id, sessionId);
};

const skipKinds = async (context: Fixture, sessionId: string) =>
  (await context.store.listFlags(patient.id, sessionId))
    .flatMap((flag) => (flag.kind === 'reliable-change' ? [] : [`${flag.kind}:${flag.activityId}`]))
    .sort();

describe('pain alert in the score step', () => {
  it('sends one email for a session with two pain skips, with activity, stage, location and link only', async () => {
    const { store, deps, emails } = await fixture();
    await submit(store, 'sess-1', [painSkip(day(10)), rightTapsPerSecond(day(10), 4), sitToStandPain]);

    await score(deps, { sessionId: 'sess-1' });

    expect(emails).toHaveLength(1);
    const [email] = emails;
    expect(email?.to).toBe(attending.email);
    expect(email?.subject).toBe(painSubject);
    expect(email?.text).toContain('Activity: shoulder-raise\nStopped at: task\nBody-map location: Right shoulder');
    expect(email?.text).toContain('Activity: sit-to-stand\nStopped at: instructions\nBody-map location: not given');
    expect(email?.text).toContain('https://tempo.example.test/clinician/sessions/sess-1');
    const sent = JSON.stringify(emails);
    expect(sent).not.toContain(patient.name);
    expect(sent).not.toContain(patient.id);
    expect(sent).not.toContain(patient.institutionPatientId);
  });

  it('sends it before any scoring happens', async () => {
    const { store, deps, emails } = await fixture();
    await submit(store, 'sess-1', [painSkip(day(10)), rightTapsPerSecond(day(10), 4)]);
    const scoredWhenSent: boolean[] = [];
    const send = deps.sendEmail;
    deps.sendEmail = async (email) => {
      const [, tapping] = await store.listResults('sess-1');
      scoredWhenSent.push(tapping?.status === 'completed' && tapping.scores !== undefined);
      await send(email);
    };

    await score(deps, { sessionId: 'sess-1' });

    expect(emails).toHaveLength(1);
    expect(scoredWhenSent).toEqual([false]);
  });

  it('sends it once when the step runs again', async () => {
    const { store, deps, emails } = await fixture();
    await submit(store, 'sess-1', [painSkip(day(10)), sitToStandPain]);
    await score(deps, { sessionId: 'sess-1' });
    await score(deps, { sessionId: 'sess-1' });
    expect(emails).toHaveLength(1);
  });

  it('frees the claim when sending fails so the retry sends it', async () => {
    const { store, deps, emails } = await fixture();
    await submit(store, 'sess-1', [painSkip(day(10))]);
    const send = deps.sendEmail;
    let failures = 1;
    deps.sendEmail = async (email) => {
      if (failures-- > 0) throw new Error('SES is down');
      await send(email);
    };

    await expect(score(deps, { sessionId: 'sess-1' })).rejects.toThrow('SES is down');
    expect(emails).toHaveLength(0);
    await score(deps, { sessionId: 'sess-1' });
    await score(deps, { sessionId: 'sess-1' });
    expect(emails).toHaveLength(1);
  });

  it('sends nothing for a skip with another reason', async () => {
    const { store, deps, emails } = await fixture();
    await submit(store, 'sess-1', [skip('shoulder-raise', 'tired', day(10))]);
    await score(deps, { sessionId: 'sess-1' });
    expect(emails).toEqual([]);
  });

  it('carries on without an attending to email', async () => {
    const { store, deps, emails } = await fixture();
    await store.putPatient({ ...patient, attendingId: 'staff-missing' });
    await submit(store, 'sess-1', [painSkip(day(10))]);
    await expect(score(deps, { sessionId: 'sess-1' })).resolves.toEqual({ sessionId: 'sess-1' });
    expect(emails).toEqual([]);
  });
});

describe('session status', () => {
  it('is completed with skips right after the score step and after the whole pipeline', async () => {
    const { store, deps } = await fixture();
    await submit(store, 'sess-1', [rightTapsPerSecond(day(10), 4), skip('sit-to-stand', 'tired', day(10))]);
    await score(deps, { sessionId: 'sess-1' });
    expect((await store.getSession('sess-1'))?.status).toBe('completed-with-skips');
    await runPipeline(deps, { sessionId: 'sess-1' });
    expect((await store.getSession('sess-1'))?.status).toBe('completed-with-skips');
  });
});

describe('pain skip flag', () => {
  it('is raised for each activity skipped because of pain', async () => {
    const context = await fixture();
    expect(await runSession(context, 'sess-1', 10, [painSkip(day(10))])).toEqual([
      {
        id: 'sess-1:pain-skip:shoulder-raise',
        patientId: patient.id,
        sessionId: 'sess-1',
        kind: 'pain-skip',
        activityId: 'shoulder-raise',
        stage: 'task',
        painLocation: 'right-shoulder',
        createdAt: now.toISOString(),
      },
    ]);
  });

  it('is not raised for a skip with another reason', async () => {
    const context = await fixture();
    expect(await runSession(context, 'sess-1', 10, [skip('shoulder-raise', 'tired', day(10))])).toEqual([]);
  });
});

describe('repeated skip flag', () => {
  it('is raised when the same activity was skipped in the previous session too', async () => {
    const context = await fixture();
    await runSession(context, 'sess-1', 3, [skip('sit-to-stand', 'tired', day(3))]);
    expect(await runSession(context, 'sess-2', 5, [skip('sit-to-stand', 'physically-unable', day(5))])).toEqual([
      {
        id: 'sess-2:repeated-skip:sit-to-stand',
        patientId: patient.id,
        sessionId: 'sess-2',
        kind: 'repeated-skip',
        activityId: 'sit-to-stand',
        previousSessionId: 'sess-1',
        reason: 'physically-unable',
        createdAt: now.toISOString(),
      },
    ]);
  });

  it('is not raised when the activity was done in between', async () => {
    const context = await fixture();
    await runSession(context, 'sess-1', 3, [skip('finger-tapping', 'tired', day(3))]);
    await runSession(context, 'sess-2', 5, [rightTapsPerSecond(day(5), 4)]);
    await runSession(context, 'sess-3', 7, [skip('finger-tapping', 'tired', day(7))]);
    expect(await skipKinds(context, 'sess-3')).toEqual([]);
  });

  it('is not raised when the previous session skipped a different activity', async () => {
    const context = await fixture();
    await runSession(context, 'sess-1', 3, [skip('shoulder-raise', 'tired', day(3))]);
    await runSession(context, 'sess-2', 5, [skip('sit-to-stand', 'tired', day(5))]);
    expect(await skipKinds(context, 'sess-2')).toEqual([]);
  });

  it('is not raised in the first session', async () => {
    const context = await fixture();
    await runSession(context, 'sess-1', 3, [skip('sit-to-stand', 'tired', day(3))]);
    expect(await skipKinds(context, 'sess-1')).toEqual([]);
  });

  it('is raised next to the pain flag when both rules apply', async () => {
    const context = await fixture();
    await runSession(context, 'sess-1', 3, [painSkip(day(3))]);
    await runSession(context, 'sess-2', 5, [painSkip(day(5))]);
    expect(await skipKinds(context, 'sess-2')).toEqual(['pain-skip:shoulder-raise', 'repeated-skip:shoulder-raise']);
    expect((await context.store.getReport('sess-2'))?.attention.map((flag) => flag.kind).sort()).toEqual([
      'pain-skip',
      'repeated-skip',
    ]);
  });
});

describe('previousSession', () => {
  const session = (id: string, status: Session['status'], createdAt: string, submittedAt?: string): Session => ({
    id,
    patientId: patient.id,
    planId: 'plan-1',
    planVersion: 1,
    mode: 'kiosk',
    status,
    partial: false,
    createdAt,
    ...(submittedAt ? { submittedAt } : {}),
  });

  it('takes the latest earlier finished session by submission time and skips open ones', () => {
    const current = session('sess-4', 'submitted', day(1), day(9));
    const sessions = [
      session('sess-1', 'processed', day(2), day(3)),
      session('sess-2', 'completed-with-skips', day(1), day(5)),
      session('sess-3', 'in-progress', day(6)),
      session('sess-5', 'created', day(8)),
      current,
      session('sess-6', 'processed', day(10), day(11)),
    ];
    expect(previousSession(sessions, current)?.id).toBe('sess-2');
    expect(previousSession([current], current)).toBeUndefined();
  });
});

describe('skips and baselines', () => {
  const comparisonAfter = async (earlier: SubmittedResult[]) => {
    const context = await fixture();
    await history(context.store, tapsPerSecond, 'right', [4.2, 3.8]);
    if (earlier.length > 0) await runSession(context, 'sess-0', 5, earlier);
    await submit(context.store, 'sess-1', [rightTapsPerSecond(day(10), 2)], { createdAt: day(10) });
    await score(context.deps, { sessionId: 'sess-1' });
    return (await compare(context.deps, { sessionId: 'sess-1', aiItems: [] })).comparisons;
  };

  it('leaves the baseline, band and previous value of the next scored session unchanged', async () => {
    const skipped = await comparisonAfter([skip('finger-tapping', 'tired', day(5))]);
    expect(skipped).toEqual(await comparisonAfter([]));
    expect(skipped.find((comparison) => comparison.side === 'right')).toMatchObject({ baseline: 3.8, previous: 3.8 });
  });

  it('raises no reliable-change flag for a skip after two bad sessions', async () => {
    const context = await fixture();
    await history(context.store, tapsPerSecond, 'right', [4, 4, 4, 2]);
    await submit(context.store, 'sess-1', [skip('finger-tapping', 'tired', day(10))]);
    await score(context.deps, { sessionId: 'sess-1' });
    await detectChange(context.deps, await compare(context.deps, { sessionId: 'sess-1', aiItems: [] }));
    expect(await context.store.listFlags(patient.id, 'sess-1')).toEqual([]);
  });
});
