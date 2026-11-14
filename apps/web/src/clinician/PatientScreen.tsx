import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import type { AffectedLimb, PatientDetailResponse, PatientMetric } from '@tempo/shared';
import { Card, EmptyState, LargeTitle } from '../ui/index.ts';
import { usePatient, usePatientMetrics } from './api.ts';
import { ageFrom, formatNumber, formatShortDate, formatUnit, profileLabels, sexLabels } from './format.ts';
import { metricNames } from './metricNames.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';

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
            </div>
            <section className="flex flex-col gap-2">
              <h2 className="text-title-3 font-semibold">Pinned</h2>
              <PinnedMetrics patientId={patientId} />
            </section>
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
