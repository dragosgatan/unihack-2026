import type { ActivityResult, Score, Session } from '@tempo/shared';
import { sideOf, type PointWrite } from '../ports.ts';

export type CompletedActivityResult = Extract<ActivityResult, { status: 'completed' }>;
export type SkippedActivityResult = Extract<ActivityResult, { status: 'skipped' }>;

export const isCompleted = (result: ActivityResult): result is CompletedActivityResult => result.status === 'completed';
export const isSkipped = (result: ActivityResult): result is SkippedActivityResult => result.status === 'skipped';

export const withScores = (
  result: CompletedActivityResult,
  scoredBy: Score['scoredBy'],
  scores: Score[],
): CompletedActivityResult => ({
  ...result,
  scores: [...(result.scores ?? []).filter((score) => score.scoredBy !== scoredBy), ...scores],
});

export const metricPoints = (session: Session, results: ActivityResult[], scoredBy: Score['scoredBy']): PointWrite[] =>
  results.filter(isCompleted).flatMap((result) =>
    (result.scores ?? [])
      .filter((score) => score.scoredBy === scoredBy)
      .map((score) => ({
        patientId: session.patientId,
        sessionId: session.id,
        metricId: score.metricId,
        ...sideOf(score.side),
        t: result.completedAt,
        value: score.value,
      })),
  );
