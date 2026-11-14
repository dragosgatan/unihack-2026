import type {
  ActivityId,
  ActivityResult,
  CheckInEntry,
  Episode,
  Session,
  SkipEvent,
  SkippedResult,
  SkipReason,
  SubmittedResult,
} from '@tempo/shared';

const skipLabels: Record<SkipReason, string> = {
  pain: 'Skipped because of pain',
  tired: 'Skipped, too tired',
  'not-understood': 'Skipped, instructions not clear',
  'cannot-see-or-hear': 'Skipped, could not see or hear',
  'physically-unable': 'Skipped, physically unable',
  'device-problem': 'Skipped, device problem',
  other: 'Skipped',
};

export type StoredSkip = { activityId: ActivityId; event: SkipEvent };

const resultId = (sessionId: string, index: number): string => `${sessionId}-r${String(index).padStart(2, '0')}`;

export const storedResults = (session: Session, results: SubmittedResult[]): ActivityResult[] =>
  results.map((result, index) => ({
    ...result,
    id: resultId(session.id, index),
    sessionId: session.id,
    patientId: session.patientId,
  }));

const skipOf = (id: string, sessionId: string, result: SkippedResult): StoredSkip => ({
  activityId: result.activityId,
  event: {
    id,
    t: result.skippedAt,
    type: 'skip',
    label: skipLabels[result.reason],
    sessionId,
    reason: result.reason,
    stage: result.stage,
  },
});

export const storedSkips = (session: Session, results: SubmittedResult[]): StoredSkip[] =>
  results.flatMap((result, index) =>
    result.status === 'skipped' ? [skipOf(resultId(session.id, index), session.id, result)] : [],
  );

export const skipsOfResults = (results: ActivityResult[]): StoredSkip[] =>
  results.flatMap((result) => (result.status === 'skipped' ? [skipOf(result.id, result.sessionId, result)] : []));

export const storedCheckIns = (session: Session, results: SubmittedResult[]): CheckInEntry[] =>
  results.flatMap((result, index) => {
    if (result.status !== 'completed') return [];
    const { raw } = result;
    if (raw.activityId !== 'check-in-pain' && raw.activityId !== 'check-in-medication' && raw.activityId !== 'check-in-episodes') {
      return [];
    }
    return [
      {
        id: resultId(session.id, index),
        patientId: session.patientId,
        sessionId: session.id,
        recordedAt: result.completedAt,
        recordedBy: { kind: 'patient' },
        body: raw.data,
      },
    ];
  });

export const checkInEpisodeId = (entryId: string, index: number): string => `${entryId}-e${index}`;

export const episodesOfCheckIns = (entries: CheckInEntry[]): Episode[] =>
  entries.flatMap(({ id, patientId, recordedAt, body }) =>
    body.item === 'episodes'
      ? body.episodes.flatMap(({ type, count, description }, index) =>
          count > 0
            ? [
                {
                  id: checkInEpisodeId(id, index),
                  patientId,
                  type,
                  count,
                  occurredAt: recordedAt,
                  ...(description === undefined ? {} : { description }),
                  source: 'check-in' as const,
                },
              ]
            : [],
        )
      : [],
  );

export const byOccurredAt = (a: Episode, b: Episode): number =>
  a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export const storedEpisodes = (session: Session, results: SubmittedResult[]): Episode[] =>
  episodesOfCheckIns(storedCheckIns(session, results));
