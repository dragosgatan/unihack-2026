import type { Session } from '@tempo/shared';
import { Badge, GroupedListRow, type BadgeTone } from '../ui/index.ts';
import { formatDateTime } from './format.ts';
import { sessionBadgeLabels, sessionBadges, sessionModeLabels, sessionTime, type SessionBadge } from './sessionSummary.ts';

const badgeTones: Record<SessionBadge, BadgeTone> = {
  'completed-with-skips': 'warning',
  partial: 'neutral',
  'in-progress': 'accent',
  'not-started': 'neutral',
};

export function SessionBadges({ session, hasSkips }: { session: Session; hasSkips: boolean }) {
  const badges = sessionBadges(session, hasSkips);
  if (badges.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <Badge key={badge} tone={badgeTones[badge]}>
          {sessionBadgeLabels[badge]}
        </Badge>
      ))}
    </span>
  );
}

export function SessionListRow({ patientId, session, hasSkips }: { patientId: string; session: Session; hasSkips: boolean }) {
  return (
    <GroupedListRow
      title={<span className="tabular-nums">{formatDateTime(sessionTime(session))}</span>}
      subtitle={
        <span className="flex flex-col gap-1">
          <span className="truncate">{sessionModeLabels[session.mode]}</span>
          <SessionBadges session={session} hasSkips={hasSkips} />
        </span>
      }
      chevron
      href={`/clinician/patients/${patientId}/sessions/${session.id}`}
    />
  );
}
