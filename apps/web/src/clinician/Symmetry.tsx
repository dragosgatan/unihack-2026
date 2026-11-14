import { useMemo, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  metricDefinitions,
  metricRangeSchema,
  type CompletedRehabPhase,
  type Injury,
  type MedicalRecord,
  type MetricId,
  type MetricRange,
  type MetricSeries,
  type PatientMetric,
  type Side,
} from '@tempo/shared';
import { Card, EmptyState, GroupedList, GroupedListRow, LargeTitle, MetricChart, MetricRangeControl } from '../ui/index.ts';
import { useMetricSeriesList, usePatient, usePatientMetrics, type SeriesRequest } from './api.ts';
import { useSymmetrySeries, type SymmetrySeries } from './useSymmetrySeries.ts';
import { formatDate, formatNumber, withUnit } from './format.ts';
import { MetIcon, NotYetIcon } from './icons.tsx';
import { metricNames } from './metricNames.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';
import { affectedSide, lateralMetricIds, latestPoint, otherSide, pairByTime, sideInitials, sideLabels, symmetryApplies, symmetryIndex, weeksBetween } from './symmetry.ts';

function weeksText(weeks: number): string {
  return weeks === 1 ? '1 week' : `${weeks} weeks`;
}

// A limb symmetry index of 90% is the common return-to-sport criterion (Grindem et al., Br J Sports Med 2016).
const returnToSportTarget = { value: 90, label: '90%' };

function injuryName(injury: Injury): string {
  const { structure } = injury;
  const lowered = /^[A-Z][a-z]/.test(structure) ? structure.charAt(0).toLowerCase() + structure.slice(1) : structure;
  return `${sideLabels[injury.side]} ${lowered}`;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-footnote text-label-secondary">{label}</dt>
      <dd className="break-words text-body">{children}</dd>
    </div>
  );
}

function FactsCard({ injury, now }: { injury: Injury; now: Date }) {
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <Fact label="Injured">{injuryName(injury)}</Fact>
        </div>
        {injury.surgery ? (
          <Fact label="Weeks since surgery">{weeksText(weeksBetween(injury.surgery.date, now))}</Fact>
        ) : (
          <Fact label="Weeks since injury">{weeksText(weeksBetween(injury.dateOfInjury, now))}</Fact>
        )}
        {injury.rehabPhase && <Fact label="Weeks in phase">{weeksText(weeksBetween(injury.rehabPhase.enteredAt, now))}</Fact>}
        {injury.rehabPhase && (
          <div className="col-span-2 sm:col-span-3">
            <Fact label="Current phase">{injury.rehabPhase.name}</Fact>
          </div>
        )}
      </dl>
    </Card>
  );
}

function SymmetryChartCard({ symmetry, range }: { symmetry: SymmetrySeries; range: MetricRange }) {
  return (
    <Card>
      <MetricChart
        series={symmetry.series}
        range={range}
        title="Limb symmetry"
        formatValue={formatNumber}
        target={returnToSportTarget}
      />
      <p className="mt-3 text-footnote text-label-secondary">From {symmetry.measure.charAt(0).toLowerCase() + symmetry.measure.slice(1)}</p>
    </Card>
  );
}

interface SideComparison {
  metricId: MetricId;
  affected: MetricSeries;
  other: MetricSeries;
}

function comparisonLine({ metricId, affected, other }: SideComparison): string | null {
  const pair = pairByTime(affected.points, other.points).at(-1);
  if (!pair) return null;
  if (metricDefinitions[metricId].higherIsBetter) {
    const index = symmetryIndex(pair.first, pair.second);
    return index === null ? null : `Symmetry ${formatNumber(index)}%`;
  }
  return `Difference ${withUnit(Math.abs(pair.first - pair.second), affected.unit)}`;
}

function ComparisonRow({ patientId, comparison, affectedSide: side }: { patientId: string; comparison: SideComparison; affectedSide: Side }) {
  const latestAffected = latestPoint(comparison.affected.points);
  const latestOther = latestPoint(comparison.other.points);
  const unit = comparison.affected.unit;
  const values = `${sideInitials[side]} ${latestAffected ? withUnit(latestAffected.value, unit) : '—'} · ${sideInitials[otherSide(side)]} ${latestOther ? withUnit(latestOther.value, unit) : '—'}`;
  const line = comparisonLine(comparison);
  return (
    <GroupedListRow
      title={metricNames[comparison.metricId]}
      subtitle={
        <>
          <span className="block truncate tabular-nums text-label">{values}</span>
          <span className="block truncate">{line ?? 'No session with both sides in this range'}</span>
        </>
      }
      chevron
      href={`/clinician/patients/${patientId}/metrics/${comparison.metricId}?side=both`}
    />
  );
}

function RehabPhaseCard({ phase }: { phase: NonNullable<Injury['rehabPhase']> }) {
  return (
    <Card title="Rehab phase">
      <p className="text-headline">{phase.name}</p>
      <p className="text-footnote text-label-secondary">Since {formatDate(phase.enteredAt)}</p>
      {phase.targets.length > 0 && (
        <>
          <h3 className="mt-4 text-footnote text-label-secondary">Criteria for the next phase</h3>
          <ul className="mt-1 flex flex-col">
            {phase.targets.map((target) => (
              <li key={target.label} className="flex min-h-11 items-center gap-3 border-b border-separator py-2 last:border-b-0">
                <span className={`size-5 shrink-0 [&>svg]:size-full ${target.met ? 'text-positive' : 'text-label-tertiary'}`}>{target.met ? <MetIcon /> : <NotYetIcon />}</span>
                <span className="min-w-0 flex-1 break-words text-body">{target.label}</span>
                <span className="shrink-0 text-subhead text-label-secondary">{target.met ? 'Met' : 'Not yet'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-footnote text-label-secondary">The therapist decides when to move to the next phase.</p>
    </Card>
  );
}

function CompletedPhases({ phases }: { phases: readonly CompletedRehabPhase[] }) {
  return (
    <GroupedList header="Completed phases">
      {phases.map((phase) => (
        <GroupedListRow
          key={`${phase.name}-${phase.enteredAt}`}
          title={phase.name}
          subtitle={
            <>
              <span className="block truncate">
                {formatDate(phase.enteredAt)} – {formatDate(phase.completedAt)}
              </span>
              <span className="block truncate">
                {phase.targets.filter((target) => target.met).length} of {phase.targets.length} targets met
              </span>
            </>
          }
        />
      ))}
    </GroupedList>
  );
}

interface ContentProps {
  patientId: string;
  record: MedicalRecord;
  affected: Side;
  metrics: readonly PatientMetric[];
  range: MetricRange;
}

function SymmetryData({ patientId, record, affected, metrics, range }: ContentProps) {
  const lateral = useMemo(() => lateralMetricIds(metrics), [metrics]);
  const requests = useMemo(
    () =>
      lateral.flatMap((metricId): SeriesRequest[] => [
        { metricId, side: affected },
        { metricId, side: otherSide(affected) },
      ]),
    [lateral, affected],
  );
  const results = useMetricSeriesList(patientId, requests, range);
  const symmetry = useSymmetrySeries(patientId, record, metrics, range);

  if (results.some((result) => result.isPending) || symmetry.pending) return <LoadingSkeleton rows={3} />;
  const failed = results.filter((result) => result.isError);
  if (failed.length > 0 || symmetry.failed) {
    return (
      <LoadError
        onRetry={() => {
          failed.forEach((result) => void result.refetch());
          symmetry.retry();
        }}
      />
    );
  }

  const comparisons = lateral.flatMap((metricId, index): SideComparison[] => {
    const affectedSeries = results[index * 2]?.data;
    const otherSeries = results[index * 2 + 1]?.data;
    return affectedSeries && otherSeries ? [{ metricId, affected: affectedSeries, other: otherSeries }] : [];
  });

  return (
    <>
      {symmetry.value && <SymmetryChartCard symmetry={symmetry.value} range={range} />}
      <GroupedList header="Left vs right">
        {comparisons.map((comparison) => (
          <ComparisonRow key={comparison.metricId} patientId={patientId} comparison={comparison} affectedSide={affected} />
        ))}
      </GroupedList>
    </>
  );
}

function SymmetryContent(props: ContentProps & { onRangeChange: (range: MetricRange) => void }) {
  const { record, range, onRangeChange } = props;
  const injury = record.injury;
  const now = useMemo(() => new Date(), []);
  return (
    <>
      {injury && <FactsCard injury={injury} now={now} />}
      <MetricRangeControl value={range} onChange={onRangeChange} />
      <SymmetryData {...props} />
      {injury?.rehabPhase && <RehabPhaseCard phase={injury.rehabPhase} />}
      {injury && injury.phaseHistory.length > 0 && <CompletedPhases phases={injury.phaseHistory} />}
    </>
  );
}

function SymmetryBody({ patientId }: { patientId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const patient = usePatient(patientId);
  const metrics = usePatientMetrics(patientId);
  const parsedRange = metricRangeSchema.safeParse(searchParams.get('range'));
  const range: MetricRange = parsedRange.success ? parsedRange.data : 'M';

  function setRange(next: MetricRange) {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        params.set('range', next);
        return params;
      },
      { replace: true },
    );
  }

  const record = patient.data?.record;
  const affected = record ? affectedSide(record) : null;
  const applies = record !== undefined && metrics.data !== undefined && symmetryApplies(record, metrics.data.metrics);

  return (
    <main>
      <LargeTitle title="Limb symmetry" back={{ to: `/clinician/patients/${patientId}`, label: patient.data?.patient.name ?? 'Patient' }} />
      {patient.isSuccess && <p className="truncate px-4 pb-4 text-subhead text-label-secondary">{patient.data.patient.name}</p>}
      <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8">
        {(patient.isPending || metrics.isPending) && <LoadingSkeleton rows={3} />}
        {(patient.isError || metrics.isError) && (
          <LoadError
            onRetry={() => {
              if (patient.isError) void patient.refetch();
              if (metrics.isError) void metrics.refetch();
            }}
          />
        )}
        {patient.isSuccess && metrics.isSuccess && (!applies || affected === null) && (
          <EmptyState title="No limb symmetry" message="This view needs an affected side and a test or exercise measured on both sides." />
        )}
        {applies && record && affected !== null && metrics.data && (
          <SymmetryContent patientId={patientId} record={record} affected={affected} metrics={metrics.data.metrics} range={range} onRangeChange={setRange} />
        )}
      </div>
    </main>
  );
}

export function Symmetry() {
  const { patientId = '' } = useParams();
  return <SymmetryBody key={patientId} patientId={patientId} />;
}
