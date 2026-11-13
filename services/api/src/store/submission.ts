import type { ActivityId, ActivityResult, Session, SkipEvent, SkipReason, SubmittedResult } from '@tempo/shared';

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

export const storedSkips = (session: Session, results: SubmittedResult[]): StoredSkip[] =>
  results.flatMap((result, index) =>
    result.status === 'skipped'
      ? [
          {
            activityId: result.activityId,
            event: {
              id: resultId(session.id, index),
              t: result.skippedAt,
              type: 'skip',
              label: skipLabels[result.reason],
              sessionId: session.id,
              reason: result.reason,
              stage: result.stage,
            },
          },
        ]
      : [],
  );
