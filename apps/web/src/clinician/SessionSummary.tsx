import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { bodyRegionLabel, metricDefinitions, type Flag, type PatientMetric, type Session } from '@tempo/shared';
import { Card, EmptyState, GroupedList, GroupedListRow, LargeTitle } from '../ui/index.ts';
import { activityNames } from './activityNames.ts';
import { usePatient, usePatientFlags, usePatientMetrics, usePatientSessions } from './api.ts';
import { formatDate, formatDateTime, withUnit } from './format.ts';
import { SkippedIcon } from './icons.tsx';
import { metricNames } from './metricNames.ts';
import { skipReasonLabels, skipStageLabels } from './sessions.ts';
import {
  sessionModeLabels,
  sessionResults,
  sessionSkips,
  sessionStatusLabels,
  sessionTime,
  splitCheckIn,
  type MetricResult,
  type SessionSkip,
} from './sessionSummary.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';
import { sideInitials } from './symmetry.ts';
import { useSessionSeries } from './useSessionSeries.ts';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-footnote text-label-secondary">{label}</dt>
      <dd className="break-words text-body">{children}</dd>
    </div>
  );
}

function statusLabel(session: Session, hasSkips: boolean): string {
  const finished = session.status !== 'created' && session.status !== 'in-progress';
  return finished && hasSkips ? sessionStatusLabels['completed-with-skips'] : sessionStatusLabels[session.status];
}

function FactsCard({ session, hasSkips }: { session: Session; hasSkips: boolean }) {
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <Fact label="Date">
            <span className="tabular-nums">{formatDateTime(sessionTime(session))}</span>
          </Fact>
        </div>
        <Fact label="Where">{sessionModeLabels[session.mode]}</Fact>
        <Fact label="Status">{statusLabel(session, hasSkips)}</Fact>
        <Fact label="Plan">Version {session.planVersion}</Fact>
        <Fact label="Partial">{session.partial ? 'Yes' : 'No'}</Fact>
      </dl>
    </Card>
  );
}

function skipLine(skip: SessionSkip): string {
  const reason = skipReasonLabels[skip.reason];
  return skip.stage === undefined ? reason : `${reason} · ${skipStageLabels[skip.stage]}`;
}

function SkippedRow({ patientId, skip, metrics }: { patientId: string; skip: SessionSkip; metrics: readonly PatientMetric[] }) {
  const firstMetric = metrics.find((metric) => metricDefinitions[metric.metricId].activityId === skip.activityId);
  return (
    <GroupedListRow
      icon={<SkippedIcon />}
      iconTint={skip.reason === 'pain' ? 'critical' : 'warning'}
      title={activityNames[skip.activityId]}
      subtitle={
        <>
          <span className="block truncate">{skipLine(skip)}</span>
          {skip.painLocation !== undefined && <span className="block truncate">Pain: {bodyRegionLabel(skip.painLocation, 'en')}</span>}
          {skip.skippedLastSession && <span className="block truncate">Also skipped last session</span>}
        </>
      }
      chevron={firstMetric !== undefined}
      href={firstMetric ? `/clinician/patients/${patientId}/metrics/${firstMetric.metricId}` : undefined}
    />
  );
}

function sideText(value: number | null, unit: string): string {
  return value === null ? '—' : withUnit(value, unit);
}

function MetricRow({ metric, href }: { metric: MetricResult; href: string }) {
  const { value, unit } = metric;
  if (value.kind === 'single') {
    return <GroupedListRow title={metricNames[metric.metricId]} value={<span className="tabular-nums text-label">{withUnit(value.value, unit)}</span>} chevron href={href} />;
  }
  return (
    <GroupedListRow
      title={metricNames[metric.metricId]}
      subtitle={<span className="tabular-nums text-label">{`${sideInitials.left} ${sideText(value.left, unit)} · ${sideInitials.right} ${sideText(value.right, unit)}`}</span>}
      chevron
      href={href}
    />
  );
}

interface SummaryContentProps {
  patientId: string;
  session: Session;
  metrics: readonly PatientMetric[];
  flags: readonly Flag[];
}

function SummaryContent({ patientId, session, metrics, flags }: SummaryContentProps) {
  const sessionSeries = useSessionSeries(patientId, metrics);

  if (sessionSeries.pending) return <LoadingSkeleton rows={3} />;
  if (sessionSeries.failed) return <LoadError onRetry={sessionSeries.retry} />;

  const skips = sessionSkips(
    sessionSeries.fetched.map((entry) => entry.series),
    flags,
    session.id,
  );
  const skippedActivities = new Set(skips.map((skip) => skip.activityId));
  const { activities, checkIn } = splitCheckIn(sessionResults(sessionSeries.fetched, session.id, skippedActivities));
  const metricHref = (metric: MetricResult) =>
    `/clinician/patients/${patientId}/metrics/${metric.metricId}${metricDefinitions[metric.metricId].lateral ? '?side=both' : ''}`;

  return (
    <>
      <FactsCard session={session} hasSkips={skips.length > 0} />
      {skips.length > 0 && (
        <GroupedList header="Couldn't do">
          {skips.map((skip) => (
            <SkippedRow key={skip.key} patientId={patientId} skip={skip} metrics={metrics} />
          ))}
        </GroupedList>
      )}
      {activities.length === 0 && checkIn.length === 0 ? (
        <EmptyState title="No results for this session" message="Results appear here once the session has been submitted." />
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="text-title-3 font-semibold">Results</h2>
          {checkIn.length > 0 && (
            <GroupedList header="Check-in">
              {checkIn.map((metric) => (
                <MetricRow key={metric.metricId} metric={metric} href={`/clinician/patients/${patientId}/check-in`} />
              ))}
            </GroupedList>
          )}
          {activities.map((activity) => (
            <GroupedList key={activity.activityId} header={activityNames[activity.activityId]}>
              {activity.metrics.map((metric) => (
                <MetricRow key={metric.metricId} metric={metric} href={metricHref(metric)} />
              ))}
            </GroupedList>
          ))}
        </section>
      )}
    </>
  );
}

function SessionSummaryBody({ patientId, sessionId }: { patientId: string; sessionId: string }) {
  const patient = usePatient(patientId);
  const sessions = usePatientSessions(patientId);
  const metrics = usePatientMetrics(patientId);
  const flags = usePatientFlags(patientId);
  const session = sessions.data?.sessions.find((candidate) => candidate.id === sessionId);
  const queries = [patient, sessions, metrics, flags];
  const pending = queries.some((query) => query.isPending);
  const failed = queries.filter((query) => query.isError);

  return (
    <main>
      <LargeTitle title={session ? formatDate(sessionTime(session)) : 'Session'} back={{ to: `/clinician/patients/${patientId}/sessions`, label: 'Sessions' }} />
      {patient.isSuccess && <p className="truncate px-4 pb-4 text-subhead text-label-secondary">{patient.data.patient.name}</p>}
      <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8">
        {pending && failed.length === 0 && <LoadingSkeleton rows={3} />}
        {failed.length > 0 && <LoadError onRetry={() => failed.forEach((query) => void query.refetch())} />}
        {sessions.isSuccess && !session && <EmptyState title="Session not found" message="Go back to the sessions list and pick a session." />}
        {!pending && failed.length === 0 && session && metrics.data && flags.data && (
          <SummaryContent patientId={patientId} session={session} metrics={metrics.data.metrics} flags={flags.data.flags} />
        )}
      </div>
    </main>
  );
}

export function SessionSummary() {
  const { patientId = '', sessionId = '' } = useParams();
  return <SessionSummaryBody key={`${patientId}/${sessionId}`} patientId={patientId} sessionId={sessionId} />;
}
