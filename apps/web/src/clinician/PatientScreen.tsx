import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import type { AffectedLimb, MedicalRecord, PatientDetailResponse, PatientMetric } from '@tempo/shared';
import { Card, EmptyState, GroupedList, GroupedListRow, LargeTitle, MiniChart } from '../ui/index.ts';
import { useMetricSeries, usePatient, usePatientDevices, usePatientFlags, usePatientMetrics, usePatientSessions } from './api.ts';
import { isCheckInMetric } from './checkIn.ts';
import { Highlights } from './Highlights.tsx';
import { ageFrom, formatNumber, formatShortDate, formatUnit, profileLabels, sexLabels } from './format.ts';
import { metricNames } from './metricNames.ts';
import { pairedCountLabel } from './pairing.ts';
import { SessionListRow } from './SessionListRow.tsx';
import { sessionsWithSkips } from './sessionSummary.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';
import { Suggestions } from './Suggestions.tsx';
import { useSymmetrySeries } from './useSymmetrySeries.ts';
import { latestPoint } from './symmetry.ts';

const sideLabels = { left: 'Left', right: 'Right' } as const;

function limbLabel(limb: AffectedLimb): string {
  return `${sideLabels[limb.side]} ${limb.limb}${limb.prosthesis ? ', prosthesis' : ''}`;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-footnote text-label-secondary">{label}</dt>
      <dd className="break-words text-body">{children}</dd>
    </div>
  );
}

function PatientHeader({ detail }: { detail: PatientDetailResponse }) {
  const { patient, record } = detail;
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Fact label="Age">{ageFrom(patient.dateOfBirth)} years</Fact>
        <Fact label="Sex">{sexLabels[patient.sex]}</Fact>
        <Fact label="Patient ID">{patient.institutionPatientId}</Fact>
        <Fact label="Profile">{profileLabels[patient.profile]}</Fact>
        <Fact label="Dominant hand">{sideLabels[record.dominantHand]}</Fact>
        {record.affectedLimbs.length > 0 && <Fact label="Affected limbs">{record.affectedLimbs.map(limbLabel).join('; ')}</Fact>}
      </dl>
      {record.diagnoses.length > 0 && (
        <div className="mt-4 border-t border-separator pt-3">
          <h2 className="text-footnote text-label-secondary">Diagnoses</h2>
          <ul className="mt-1 flex flex-col gap-2">
            {record.diagnoses.map((diagnosis) => (
              <li key={diagnosis.code} className="flex min-w-0 flex-col break-words">
                <span className="text-body">{diagnosis.label}</span>
                <span className="text-footnote tabular-nums text-label-secondary">{diagnosis.code}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function HomePhoneRow({ patientId }: { patientId: string }) {
  const devices = usePatientDevices(patientId);
  return (
    <GroupedList className="mt-3">
      <GroupedListRow
        title="Home phone"
        value={devices.isSuccess ? pairedCountLabel(devices.data.devices) : undefined}
        chevron
        href={`/clinician/patients/${patientId}/devices`}
      />
    </GroupedList>
  );
}

function MetricCard({ patientId, metric }: { patientId: string; metric: PatientMetric }) {
  return (
    <Card title={metricNames[metric.metricId]} href={`/clinician/patients/${patientId}/metrics/${metric.metricId}`}>
      {metric.lastValue !== undefined ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-1">
            <span className="text-title-2 font-semibold tabular-nums">{formatNumber(metric.lastValue)}</span>
            {formatUnit(metric.unit) && <span className="text-subhead text-label-secondary">{formatUnit(metric.unit)}</span>}
          </p>
          {metric.lastT !== undefined && <p className="text-footnote text-label-secondary">{formatShortDate(metric.lastT)}</p>}
        </>
      ) : (
        <p className="text-subhead text-label-secondary">No data yet</p>
      )}
    </Card>
  );
}

function PinnedMetrics({ patientId }: { patientId: string }) {
  const metrics = usePatientMetrics(patientId);

  if (metrics.isPending) return <LoadingSkeleton rows={2} />;
  if (metrics.isError) return <LoadError onRetry={() => void metrics.refetch()} />;
  if (metrics.data.metrics.length === 0) {
    return <EmptyState title="No metrics yet" message="Results appear here after the first session." />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {metrics.data.metrics.map((metric) => (
        <MetricCard key={metric.metricId} patientId={patientId} metric={metric} />
      ))}
    </div>
  );
}

function LimbSymmetryCard({ patientId, record, metrics }: { patientId: string; record: MedicalRecord; metrics: readonly PatientMetric[] }) {
  const symmetry = useSymmetrySeries(patientId, record, metrics, 'M');
  const [now] = useState(() => Date.now());

  if (!symmetry.applies) return null;

  let body: ReactNode;
  if (symmetry.pending) body = <LoadingSkeleton rows={1} />;
  else if (symmetry.failed) body = <LoadError onRetry={symmetry.retry} />;
  else if (symmetry.value) {
    const latest = latestPoint(symmetry.value.series.points);
    body = (
      <Card href={`/clinician/patients/${patientId}/symmetry`} className="max-w-3xl">
        <p className="flex flex-wrap items-baseline gap-x-1">
          <span className="text-title-1 font-semibold tabular-nums">{latest ? `${formatNumber(latest.value)}%` : '—'}</span>
          {latest && <span className="text-footnote text-label-secondary">{formatShortDate(latest.t)}</span>}
        </p>
        <p className="text-subhead text-label-secondary">{symmetry.value.measure}</p>
        <MiniChart series={symmetry.value.series} now={now} className="mt-3" />
      </Card>
    );
  } else {
    body = (
      <Card href={`/clinician/patients/${patientId}/symmetry`} className="max-w-3xl">
        <p className="text-subhead text-label-secondary">Left and right results, rehab phase and criteria</p>
      </Card>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title-3 font-semibold">Limb symmetry</h2>
      {body}
    </section>
  );
}

function LimbSymmetry({ patientId, record }: { patientId: string; record: MedicalRecord }) {
  const metrics = usePatientMetrics(patientId);
  if (!metrics.isSuccess) return null;
  return <LimbSymmetryCard patientId={patientId} record={record} metrics={metrics.data.metrics} />;
}

function PainMiniChart({ patientId }: { patientId: string }) {
  const series = useMetricSeries(patientId, 'pain.intensity', 'M');
  const [now] = useState(() => Date.now());
  if (!series.data) return null;
  return <MiniChart series={series.data} now={now} className="mt-3" />;
}

function CheckInValue({ label, metric, unit }: { label: string; metric: PatientMetric | undefined; unit: string }) {
  if (metric?.lastValue === undefined) return null;
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-footnote text-label-secondary">{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-1">
        <span className="text-title-2 font-semibold tabular-nums">{formatNumber(metric.lastValue)}</span>
        <span className="text-subhead text-label-secondary">{unit}</span>
      </span>
      {metric.lastT !== undefined && <span className="text-footnote text-label-secondary">{formatShortDate(metric.lastT)}</span>}
    </div>
  );
}

function CheckInSection({ patientId }: { patientId: string }) {
  const metrics = usePatientMetrics(patientId);
  if (!metrics.isSuccess) return null;
  const checkIn = metrics.data.metrics.filter((metric) => isCheckInMetric(metric.metricId));
  if (checkIn.length === 0) return null;
  const pain = checkIn.find((metric) => metric.metricId === 'pain.intensity');
  const adherence = checkIn.find((metric) => metric.metricId === 'medication.adherence');
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title-3 font-semibold">Check-in</h2>
      <Card href={`/clinician/patients/${patientId}/check-in`} className="max-w-3xl">
        <div className="grid grid-cols-2 gap-4">
          <CheckInValue label="Latest pain" metric={pain} unit={formatUnit(pain?.unit ?? '')} />
          <CheckInValue label="Latest adherence" metric={adherence} unit={formatUnit(adherence?.unit ?? '')} />
        </div>
        <p className="mt-2 text-subhead text-label-secondary">Pain, medication and episodes on one time axis</p>
        {pain && <PainMiniChart patientId={patientId} />}
      </Card>
    </section>
  );
}

const latestSessionCount = 3;

function SessionsSection({ patientId }: { patientId: string }) {
  const sessions = usePatientSessions(patientId);
  const flags = usePatientFlags(patientId);
  if (!sessions.isSuccess || sessions.data.sessions.length === 0) return null;
  const skipped = sessionsWithSkips([], flags.data?.flags ?? []);
  return (
    <section className="flex max-w-3xl flex-col gap-2">
      <h2 className="text-title-3 font-semibold">Sessions</h2>
      <GroupedList>
        {sessions.data.sessions.slice(0, latestSessionCount).map((session) => (
          <SessionListRow key={session.id} patientId={patientId} session={session} hasSkips={skipped.has(session.id)} />
        ))}
        <GroupedListRow title={<span className="text-accent">See all sessions</span>} chevron href={`/clinician/patients/${patientId}/sessions`} />
      </GroupedList>
    </section>
  );
}

function PatientBody({ patientId }: { patientId: string }) {
  const patient = usePatient(patientId);

  return (
    <main>
      <LargeTitle title={patient.data?.patient.name ?? ''} back={{ to: '/clinician/patients', label: 'Patients' }} />
      <div className="flex flex-col gap-6 px-4 pb-8">
        {patient.isPending && <LoadingSkeleton rows={2} />}
        {patient.isError && <LoadError onRetry={() => void patient.refetch()} />}
        {patient.isSuccess && (
          <>
            <div className="max-w-3xl">
              <PatientHeader detail={patient.data} />
              <HomePhoneRow patientId={patientId} />
            </div>
            <section className="flex flex-col gap-2">
              <h2 className="text-title-3 font-semibold">Pinned</h2>
              <PinnedMetrics patientId={patientId} />
            </section>
            <LimbSymmetry patientId={patientId} record={patient.data.record} />
            <CheckInSection patientId={patientId} />
            <SessionsSection patientId={patientId} />
            <Highlights patientId={patientId} record={patient.data.record} />
            <Suggestions patientId={patientId} />
          </>
        )}
      </div>
    </main>
  );
}

export function PatientScreen() {
  const { patientId = '' } = useParams();
  return <PatientBody key={patientId} patientId={patientId} />;
}
