import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  metricDefinitions,
  metricIdSchema,
  metricRangeSchema,
  sideSchema,
  type MetricId,
  type MetricRange,
  type MetricSeries,
  type Side,
} from '@tempo/shared';
import { Badge, Card, EmptyState, GroupedList, GroupedListRow, LargeTitle, MetricChart, MetricRangeControl, SegmentedControl, type SegmentedOption } from '../ui/index.ts';
import { aboutTests, directionSentence } from './aboutTests.ts';
import { useMetricSeries, usePatient } from './api.ts';
import { metricDomains } from './domains.ts';
import { defaultSide, formatDate, formatNumber, formatUnit, withUnit } from './format.ts';
import { metricNames } from './metricNames.ts';
import { sessionRows, skipReasonLabels, skipStageLabels, type SessionRow } from './sessions.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';

const sideOptions: readonly SegmentedOption<Side>[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

function AboutCard({ metricId }: { metricId: MetricId }) {
  const about = aboutTests[metricDefinitions[metricId].activityId];
  const direction = directionSentence(metricId);
  return (
    <Card title="About this test">
      <div className="flex flex-col gap-2">
        <p className="text-body">{about.summary}</p>
        <p className="text-subhead text-label-secondary">{about.measures}</p>
        {direction !== null && <p className="text-subhead text-label-secondary">{direction}</p>}
      </div>
    </Card>
  );
}

function SessionListRow({ row, unit }: { row: SessionRow; unit: string }) {
  if (row.kind === 'result') {
    return <GroupedListRow title={formatDate(row.t)} value={<span className="tabular-nums text-label">{withUnit(row.value, unit)}</span>} />;
  }
  return (
    <GroupedListRow
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{formatDate(row.t)}</span>
          <Badge tone="warning">Skipped</Badge>
        </span>
      }
      subtitle={
        <>
          <span className="block truncate">{skipReasonLabels[row.event.reason]}</span>
          <span className="block truncate">{skipStageLabels[row.event.stage]}</span>
        </>
      }
    />
  );
}

function Sessions({ series }: { series: MetricSeries }) {
  const rows = sessionRows(series);
  return (
    <GroupedList header="Sessions">
      {rows.length === 0 ? (
        <li className="px-4 py-3 text-subhead text-label-secondary">No sessions in this range</li>
      ) : (
        rows.map((row) => <SessionListRow key={row.key} row={row} unit={series.unit} />)
      )}
    </GroupedList>
  );
}

function SeriesContent({ series, range, metricId, refreshing }: { series: MetricSeries; range: MetricRange; metricId: MetricId; refreshing: boolean }) {
  const displaySeries = useMemo(() => ({ ...series, unit: formatUnit(series.unit) }), [series]);
  return (
    <div aria-busy={refreshing} className="flex flex-col gap-6">
      <Card>
        <MetricChart series={displaySeries} range={range} title={metricNames[metricId]} formatValue={formatNumber} />
      </Card>
      <AboutCard metricId={metricId} />
      <Sessions series={series} />
    </div>
  );
}

interface MetricSectionsProps {
  patientId: string;
  metricId: MetricId;
  range: MetricRange;
  side: Side | undefined;
  onRangeChange: (range: MetricRange) => void;
  onSideChange: (side: Side) => void;
}

function MetricSections({ patientId, metricId, range, side, onRangeChange, onSideChange }: MetricSectionsProps) {
  const series = useMetricSeries(patientId, metricId, range, side);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row">
        <MetricRangeControl value={range} onChange={onRangeChange} className="sm:flex-1" />
        {side !== undefined && <SegmentedControl aria-label="Side" options={sideOptions} value={side} onChange={onSideChange} className="sm:w-48" />}
      </div>
      {series.isPending && <LoadingSkeleton rows={3} />}
      {series.isError && <LoadError onRetry={() => void series.refetch()} />}
      {series.isSuccess && <SeriesContent series={series.data} range={range} metricId={metricId} refreshing={series.isPlaceholderData} />}
    </>
  );
}

function MetricDetailBody({ patientId, metricId }: { patientId: string; metricId: MetricId }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const patient = usePatient(patientId);

  const parsedRange = metricRangeSchema.safeParse(searchParams.get('range'));
  const range: MetricRange = parsedRange.success ? parsedRange.data : 'M';
  const parsedSide = sideSchema.safeParse(searchParams.get('side'));
  const lateral = metricDefinitions[metricId].lateral;

  const back =
    searchParams.get('from') === 'browse'
      ? { to: `/clinician/browse/${metricDomains[metricId]}/${metricId}`, label: 'Back' }
      : { to: `/clinician/patients/${patientId}`, label: patient.data?.patient.name ?? 'Patient' };

  function setParam(key: 'range' | 'side', value: string) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  return (
    <main>
      <LargeTitle title={metricNames[metricId]} back={back} />
      {patient.isSuccess && <p className="truncate px-4 pb-4 text-subhead text-label-secondary">{patient.data.patient.name}</p>}
      <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8">
        {patient.isPending && <LoadingSkeleton rows={3} />}
        {patient.isError && <LoadError onRetry={() => void patient.refetch()} />}
        {patient.isSuccess && (
          <MetricSections
            patientId={patientId}
            metricId={metricId}
            range={range}
            side={lateral ? (parsedSide.success ? parsedSide.data : defaultSide(patient.data.record)) : undefined}
            onRangeChange={(next) => setParam('range', next)}
            onSideChange={(next) => setParam('side', next)}
          />
        )}
      </div>
    </main>
  );
}

export function MetricDetail() {
  const { patientId = '', metricId } = useParams();
  const parsed = metricIdSchema.safeParse(metricId);

  if (!parsed.success) {
    return (
      <main>
        <LargeTitle title="Metric" back={{ to: `/clinician/patients/${patientId}`, label: 'Patient' }} />
        <EmptyState title="Metric not found" message="Go back to the patient and pick a metric." />
      </main>
    );
  }

  return <MetricDetailBody key={`${patientId}/${parsed.data}`} patientId={patientId} metricId={parsed.data} />;
}
