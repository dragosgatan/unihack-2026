import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  metricDefinitions,
  metricIdSchema,
  metricRangeSchema,
  sideSchema,
  type MedicalRecord,
  type MetricId,
  type MetricRange,
  type MetricSeries,
  type Side,
} from '@tempo/shared';
import { Badge, Card, EmptyState, GroupedList, GroupedListRow, LargeTitle, MetricChart, MetricRangeControl, SegmentedControl, type SegmentedOption } from '../ui/index.ts';
import { aboutTests, directionSentence } from './aboutTests.ts';
import { useMetricSeries, useMetricSeriesList, usePatient } from './api.ts';
import { metricDomains } from './domains.ts';
import { defaultSide, formatDate, formatNumber, formatUnit, withUnit } from './format.ts';
import { metricNames } from './metricNames.ts';
import { pairedSessionRows, sessionRows, skipReasonLabels, skipStageLabels, type PairedSessionRow, type SessionRow } from './sessions.ts';
import { affectedSide, latestPoint, otherSide, pairByTime, sideInitials, sideLabels, symmetryIndex } from './symmetry.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';

type SideChoice = Side | 'both';

const sideOptions: readonly SegmentedOption<SideChoice>[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
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

function SkippedRow({ row }: { row: Extract<SessionRow, { kind: 'skipped' }> }) {
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

function SessionListRow({ row, unit }: { row: SessionRow; unit: string }) {
  if (row.kind === 'result') {
    return <GroupedListRow title={formatDate(row.t)} value={<span className="tabular-nums text-label">{withUnit(row.value, unit)}</span>} />;
  }
  return <SkippedRow row={row} />;
}

function sideValue(side: Side, value: number | null, unit: string): string {
  return `${sideInitials[side]} ${value === null ? '—' : withUnit(value, unit)}`;
}

function PairedSessionListRow({ row, unit, firstSide }: { row: PairedSessionRow; unit: string; firstSide: Side }) {
  if (row.kind === 'skipped') return <SkippedRow row={row} />;
  const left = firstSide === 'left' ? row.first : row.second;
  const right = firstSide === 'left' ? row.second : row.first;
  return (
    <GroupedListRow
      title={formatDate(row.t)}
      value={<span className="tabular-nums text-label">{`${sideValue('left', left, unit)} · ${sideValue('right', right, unit)}`}</span>}
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

function sideLabel(side: Side, affected: Side | null): string {
  return affected === side ? `${sideLabels[side]} (affected)` : sideLabels[side];
}

interface SidePair {
  primarySide: Side;
  primary: MetricSeries;
  compare: MetricSeries;
  affected: Side | null;
}

function SideFact({ label, series }: { label: string; series: MetricSeries }) {
  const latest = latestPoint(series.points);
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="truncate text-footnote text-label-secondary">{label}</dt>
      <dd className="flex flex-col">
        <span className="text-title-3 font-semibold tabular-nums">{latest ? withUnit(latest.value, series.unit) : '—'}</span>
        <span className="text-footnote text-label-secondary">{latest ? formatDate(latest.t) : 'No sessions in this range'}</span>
      </dd>
    </div>
  );
}

function comparisonSentence({ primary, compare, affected }: SidePair, metricId: MetricId): string | null {
  const latestPair = pairByTime(primary.points, compare.points).at(-1);
  if (!latestPair) return null;
  if (affected !== null && metricDefinitions[metricId].higherIsBetter) {
    const index = symmetryIndex(latestPair.first, latestPair.second);
    if (index !== null) return `Affected side at ${formatNumber(index)}% of the other side`;
  }
  return `Difference between sides ${withUnit(Math.abs(latestPair.first - latestPair.second), primary.unit)}`;
}

function LeftVsRightCard({ pair, metricId }: { pair: SidePair; metricId: MetricId }) {
  const { primarySide, primary, compare, affected } = pair;
  const bySide: Record<Side, MetricSeries> = primarySide === 'left' ? { left: primary, right: compare } : { left: compare, right: primary };
  const sentence = comparisonSentence(pair, metricId);
  const latestPair = pairByTime(primary.points, compare.points).at(-1);
  return (
    <Card title="Left vs right">
      <dl className="grid grid-cols-2 gap-4">
        <SideFact label={sideLabel('left', affected)} series={bySide.left} />
        <SideFact label={sideLabel('right', affected)} series={bySide.right} />
      </dl>
      <div className="mt-4 border-t border-separator pt-3">
        {sentence !== null && latestPair ? (
          <>
            <p className="text-body">{sentence}</p>
            <p className="text-footnote text-label-secondary">Latest session with both sides, {formatDate(latestPair.t)}</p>
          </>
        ) : (
          <p className="text-subhead text-label-secondary">No session with both sides in this range</p>
        )}
      </div>
    </Card>
  );
}

function PairedSessions({ pair }: { pair: SidePair }) {
  const rows = pairedSessionRows(pair.primary, pair.compare);
  return (
    <GroupedList header="Sessions">
      {rows.length === 0 ? (
        <li className="px-4 py-3 text-subhead text-label-secondary">No sessions in this range</li>
      ) : (
        rows.map((row) => <PairedSessionListRow key={row.key} row={row} unit={pair.primary.unit} firstSide={pair.primarySide} />)
      )}
    </GroupedList>
  );
}

function BothSidesContent({ pair, range, metricId }: { pair: SidePair; range: MetricRange; metricId: MetricId }) {
  const primary = useMemo(() => ({ ...pair.primary, unit: formatUnit(pair.primary.unit) }), [pair.primary]);
  const compare = useMemo(() => ({ series: { ...pair.compare, unit: formatUnit(pair.compare.unit) }, label: sideLabel(otherSide(pair.primarySide), pair.affected) }), [pair]);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <MetricChart
          series={primary}
          label={sideLabel(pair.primarySide, pair.affected)}
          compare={compare}
          range={range}
          title={metricNames[metricId]}
          formatValue={formatNumber}
        />
      </Card>
      <LeftVsRightCard pair={pair} metricId={metricId} />
      <AboutCard metricId={metricId} />
      <PairedSessions pair={pair} />
    </div>
  );
}

function BothSides({ patientId, metricId, range, record }: { patientId: string; metricId: MetricId; range: MetricRange; record: MedicalRecord }) {
  const primarySide = defaultSide(record);
  const requests = useMemo(
    () => [
      { metricId, side: primarySide },
      { metricId, side: otherSide(primarySide) },
    ],
    [metricId, primarySide],
  );
  const [primary, compare] = useMetricSeriesList(patientId, requests, range);
  if (!primary || !compare || primary.isPending || compare.isPending) return <LoadingSkeleton rows={3} />;
  if (primary.isError || compare.isError) {
    return (
      <LoadError
        onRetry={() => {
          if (primary.isError) void primary.refetch();
          if (compare.isError) void compare.refetch();
        }}
      />
    );
  }
  return <BothSidesContent pair={{ primarySide, primary: primary.data, compare: compare.data, affected: affectedSide(record) }} range={range} metricId={metricId} />;
}

function SingleSide({ patientId, metricId, range, side }: { patientId: string; metricId: MetricId; range: MetricRange; side: Side | undefined }) {
  const series = useMetricSeries(patientId, metricId, range, side);
  return (
    <>
      {series.isPending && <LoadingSkeleton rows={3} />}
      {series.isError && <LoadError onRetry={() => void series.refetch()} />}
      {series.isSuccess && <SeriesContent series={series.data} range={range} metricId={metricId} refreshing={series.isPlaceholderData} />}
    </>
  );
}

interface MetricSectionsProps {
  patientId: string;
  metricId: MetricId;
  range: MetricRange;
  side: SideChoice | undefined;
  record: MedicalRecord;
  onRangeChange: (range: MetricRange) => void;
  onSideChange: (side: SideChoice) => void;
}

function MetricSections({ patientId, metricId, range, side, record, onRangeChange, onSideChange }: MetricSectionsProps) {
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row">
        <MetricRangeControl value={range} onChange={onRangeChange} className="sm:flex-1" />
        {side !== undefined && <SegmentedControl aria-label="Side" options={sideOptions} value={side} onChange={onSideChange} className="sm:w-64" />}
      </div>
      {side === 'both' ? (
        <BothSides patientId={patientId} metricId={metricId} range={range} record={record} />
      ) : (
        <SingleSide patientId={patientId} metricId={metricId} range={range} side={side} />
      )}
    </>
  );
}

function MetricDetailBody({ patientId, metricId }: { patientId: string; metricId: MetricId }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const patient = usePatient(patientId);

  const parsedRange = metricRangeSchema.safeParse(searchParams.get('range'));
  const range: MetricRange = parsedRange.success ? parsedRange.data : 'M';
  const sideParam = searchParams.get('side');
  const parsedSide = sideSchema.safeParse(sideParam);
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
            side={lateral ? (sideParam === 'both' ? 'both' : parsedSide.success ? parsedSide.data : defaultSide(patient.data.record)) : undefined}
            record={patient.data.record}
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
