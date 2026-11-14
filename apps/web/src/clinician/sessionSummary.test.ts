import { describe, expect, it } from 'vitest';
import type { Flag, MetricSeries, Session, SkipEvent } from '@tempo/shared';
import { session } from '../../../../packages/shared/src/test-fixtures.ts';
import { sessionBadges, sessionResults, sessionSkips, sessionsWithSkips, splitCheckIn, summaryRequests } from './sessionSummary.ts';

const skip: SkipEvent = {
  id: 'evt-skip-9',
  t: '2026-11-13T10:12:00.000Z',
  type: 'skip',
  label: 'It hurts',
  sessionId: 'sess-9',
  reason: 'pain',
  stage: 'task',
};

function series(metricId: MetricSeries['metricId'], unit: string, points: MetricSeries['points'], events: MetricSeries['events'] = []): MetricSeries {
  return { metricId, unit, points, baseline: null, referenceBand: null, events };
}

const painFlag: Flag = {
  id: 'flag-pain',
  patientId: 'pat-1',
  sessionId: 'sess-9',
  kind: 'pain-skip',
  activityId: 'sit-to-stand',
  stage: 'task',
  painLocation: 'left-knee',
  createdAt: '2026-11-13T10:30:00.000Z',
};

const repeatFlag: Flag = {
  id: 'flag-repeat',
  patientId: 'pat-1',
  sessionId: 'sess-9',
  kind: 'repeated-skip',
  activityId: 'sit-to-stand',
  previousSessionId: 'sess-8',
  reason: 'pain',
  createdAt: '2026-11-13T10:30:00.000Z',
};

describe('summaryRequests', () => {
  it('asks for both sides of a lateral metric and no side otherwise', () => {
    expect(
      summaryRequests([
        { metricId: 'finger-tapping.taps-per-second', unit: 'taps/s', lateral: true },
        { metricId: 'pain.intensity', unit: '0-10', lateral: false },
      ]),
    ).toEqual([
      { metricId: 'finger-tapping.taps-per-second', side: 'left' },
      { metricId: 'finger-tapping.taps-per-second', side: 'right' },
      { metricId: 'pain.intensity', side: undefined },
    ]);
  });
});

describe('sessionSkips', () => {
  const count = series('sit-to-stand.count', 'count', [], [skip]);
  const time = series('sit-to-stand.time-per-repetition', 's', [], [skip]);

  it('lists one skip per activity even when every metric carries the event', () => {
    expect(sessionSkips([count, time], [], 'sess-9')).toEqual([
      { key: skip.id, activityId: 'sit-to-stand', t: skip.t, reason: 'pain', stage: 'task', painLocation: undefined, skippedLastSession: false },
    ]);
  });

  it('adds the pain location and the repeated note from flags for the same session and activity', () => {
    const [entry] = sessionSkips([count, time], [painFlag, repeatFlag], 'sess-9');
    expect(entry?.painLocation).toBe('left-knee');
    expect(entry?.skippedLastSession).toBe(true);
  });

  it('ignores skips and flags from other sessions', () => {
    expect(sessionSkips([count], [{ ...painFlag, sessionId: 'sess-7' }], 'sess-7')).toEqual([
      expect.objectContaining({ activityId: 'sit-to-stand', key: 'flag-pain', stage: 'task' }),
    ]);
    expect(sessionSkips([count], [], 'sess-1')).toEqual([]);
  });

  it('keeps a skip known only from a repeated-skip flag, without a stage', () => {
    expect(sessionSkips([], [repeatFlag], 'sess-9')).toEqual([
      expect.objectContaining({ activityId: 'sit-to-stand', reason: 'pain', stage: undefined, skippedLastSession: true }),
    ]);
  });
});

describe('sessionsWithSkips', () => {
  it('collects sessions from skip events and skip flags but not reliable-change flags', () => {
    const reliable: Flag = {
      id: 'flag-rc',
      patientId: 'pat-1',
      sessionId: 'sess-5',
      metricId: 'trail-making-a.time',
      kind: 'reliable-change',
      value: 70,
      baseline: 50,
      createdAt: '2026-11-01T10:00:00.000Z',
    };
    const ids = sessionsWithSkips([series('sit-to-stand.count', 'count', [], [skip])], [{ ...repeatFlag, sessionId: 'sess-3' }, reliable]);
    expect([...ids].sort()).toEqual(['sess-3', 'sess-9']);
  });
});

describe('sessionResults', () => {
  const fetched = [
    { side: 'left' as const, series: series('finger-tapping.taps-per-second', 'taps/s', [{ t: '2026-11-13T10:00:00.000Z', value: 4.6, sessionId: 'sess-9' }]) },
    { side: 'right' as const, series: series('finger-tapping.taps-per-second', 'taps/s', [{ t: '2026-11-13T10:00:00.000Z', value: 3.6, sessionId: 'sess-9' }]) },
    { side: undefined, series: series('trail-making-a.time', 's', [{ t: '2026-11-06T10:00:00.000Z', value: 50, sessionId: 'sess-8' }, { t: '2026-11-13T10:05:00.000Z', value: 52, sessionId: 'sess-9' }]) },
    { side: undefined, series: series('sit-to-stand.count', 'count', [], [skip]) },
    { side: undefined, series: series('pain.intensity', '0-10', [{ t: '2026-11-13T09:58:00.000Z', value: 2, sessionId: 'sess-9' }]) },
  ];

  it('groups this session’s values by activity in metric order, with both sides together', () => {
    const results = sessionResults(fetched, 'sess-9', new Set(['sit-to-stand']));
    expect(results.map((result) => result.activityId)).toEqual(['finger-tapping', 'trail-making-a', 'check-in-pain']);
    expect(results[0]?.metrics[0]?.value).toEqual({ kind: 'sides', left: 4.6, right: 3.6 });
    expect(results[1]?.metrics[0]?.value).toEqual({ kind: 'single', value: 52 });
  });

  it('never gives a skipped activity a value', () => {
    const withLeftover = [...fetched, { side: undefined, series: series('sit-to-stand.time-per-repetition', 's', [{ t: skip.t, value: 0, sessionId: 'sess-9' }]) }];
    expect(sessionResults(withLeftover, 'sess-9', new Set(['sit-to-stand'])).some((result) => result.activityId === 'sit-to-stand')).toBe(false);
  });

  it('keeps a missing side as null', () => {
    const [left] = fetched;
    if (!left) throw new Error('fixture missing');
    expect(sessionResults([left], 'sess-9', new Set())[0]?.metrics[0]?.value).toEqual({ kind: 'sides', left: 4.6, right: null });
  });

  it('splits check-in metrics from tests and exercises', () => {
    const { activities, checkIn } = splitCheckIn(sessionResults(fetched, 'sess-9', new Set()));
    expect(activities.map((activity) => activity.activityId)).toEqual(['finger-tapping', 'trail-making-a']);
    expect(checkIn.map((metric) => metric.metricId)).toEqual(['pain.intensity']);
  });
});

describe('sessionBadges', () => {
  const done: Session = { ...session, status: 'processed', startedAt: '2026-11-13T10:00:00.000Z' };

  it('marks a finished session with skips, by status or by skip events', () => {
    expect(sessionBadges({ ...done, status: 'completed-with-skips' }, false)).toEqual(['completed-with-skips']);
    expect(sessionBadges(done, true)).toEqual(['completed-with-skips']);
    expect(sessionBadges(done, false)).toEqual([]);
  });

  it('marks partial, in progress and not started sessions', () => {
    expect(sessionBadges({ ...done, partial: true }, false)).toEqual(['partial']);
    expect(sessionBadges({ ...done, status: 'in-progress' }, true)).toEqual(['in-progress']);
    expect(sessionBadges({ ...done, status: 'created' }, false)).toEqual(['not-started']);
  });
});
