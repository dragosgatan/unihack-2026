import { useParams } from 'react-router';
import type { Flag, PatientMetric, Session } from '@tempo/shared';
import { EmptyState, GroupedList, LargeTitle } from '../ui/index.ts';
import { usePatient, usePatientFlags, usePatientMetrics, usePatientSessions } from './api.ts';
import { SessionListRow } from './SessionListRow.tsx';
import { sessionsWithSkips } from './sessionSummary.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';
import { useSessionSeries } from './useSessionSeries.ts';

const noFlags: readonly Flag[] = [];

function SessionList({ patientId, sessions, metrics, flags }: { patientId: string; sessions: readonly Session[]; metrics: readonly PatientMetric[] | undefined; flags: readonly Flag[] }) {
  const { fetched } = useSessionSeries(patientId, metrics);
  const skipped = sessionsWithSkips(
    fetched.map((entry) => entry.series),
    flags,
  );
  return (
    <GroupedList>
      {sessions.map((session) => (
        <SessionListRow key={session.id} patientId={patientId} session={session} hasSkips={skipped.has(session.id)} />
      ))}
    </GroupedList>
  );
}

function SessionsBody({ patientId }: { patientId: string }) {
  const patient = usePatient(patientId);
  const sessions = usePatientSessions(patientId);
  const metrics = usePatientMetrics(patientId);
  const flags = usePatientFlags(patientId);

  return (
    <main>
      <LargeTitle title="Sessions" back={{ to: `/clinician/patients/${patientId}`, label: patient.data?.patient.name ?? 'Patient' }} />
      {patient.isSuccess && <p className="truncate px-4 pb-4 text-subhead text-label-secondary">{patient.data.patient.name}</p>}
      <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8">
        {sessions.isPending && <LoadingSkeleton rows={4} />}
        {sessions.isError && <LoadError onRetry={() => void sessions.refetch()} />}
        {sessions.isSuccess && sessions.data.sessions.length === 0 && <EmptyState title="No sessions yet" message="Sessions appear here once one has been started." />}
        {sessions.isSuccess && sessions.data.sessions.length > 0 && (
          <SessionList patientId={patientId} sessions={sessions.data.sessions} metrics={metrics.data?.metrics} flags={flags.data?.flags ?? noFlags} />
        )}
      </div>
    </main>
  );
}

export function Sessions() {
  const { patientId = '' } = useParams();
  return <SessionsBody key={patientId} patientId={patientId} />;
}
