import { useMemo, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  defaultSide,
  metricDefinitions,
  metricIdSchema,
  metricRangeSchema,
  type CheckInEntry,
  type Episode,
  type Flag,
  type MedicalRecord,
  type MetricId,
  type MetricRange,
  type MetricSeries,
  type PatientMetric,
} from '@tempo/shared';
import { Card, GroupedList, GroupedListRow, LargeTitle, MetricChart, MetricRangeControl, Select, type TimeDomain } from '../ui/index.ts';
import {
  useMetricSeriesList,
  usePatient,
  usePatientCheckIns,
  usePatientEpisodes,
  usePatientFlags,
  usePatientMetrics,
  type SeriesRequest,
} from './api.ts';
import { BodyMapHeat } from './BodyMapHeat.tsx';
import {
  cellDetail,
  cellLabel,
  cellsWithEpisodes,
  checkInMetricIds,
  compareCandidates,
  currentMedications,
  defaultCompareMetric,
  episodeCalendar,
  episodeCountText,
  isSingleDrugAdherence,
  lastCheckIn,
  medicationChanges,
  medicationRows,
  painRegionCounts,
  painTypeTally,
  quoted,
  sideEffectReports,
  sharedDomain,
  type CheckInMetricId,
} from './checkIn.ts';
import { painTypeLabels } from './checkInLabels.ts';
import { EpisodeCalendar } from './EpisodeCalendar.tsx';
import { formatDate, formatNumber, formatUnit } from './format.ts';
import { MedicationStrip } from './MedicationStrip.tsx';
import { metricNames } from './metricNames.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';

function withDisplayUnit(series: MetricSeries): MetricSeries {
  return { ...series, unit: formatUnit(series.unit) };
}

function Missing({ children }: { children: ReactNode }) {
  return <p className="text-subhead text-label-secondary">{children}</p>;
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-footnote text-label-secondary">{children}</h3>;
}

interface ChartProps {
  series: MetricSeries | undefined;
  range: MetricRange;
  domain: TimeDomain;
}

interface Loadable<T> {
  data: T | undefined;
  isError: boolean;
  onRetry: () => void;
}

function PainCard({ series, range, domain, flags, entries }: ChartProps & { flags: readonly Flag[]; entries: Loadable<readonly CheckInEntry[]> }) {
  const loaded = entries.data;
  const counts = useMemo(() => (loaded ? painRegionCounts(loaded, flags, domain) : []), [loaded, flags, domain]);
  const types = useMemo(() => (loaded ? painTypeTally(loaded, domain) : []), [loaded, domain]);
  return (
    <Card>
      {series ? (
        <MetricChart series={withDisplayUnit(series)} range={range} domain={domain} title="Pain" formatValue={formatNumber} />
      ) : (
        <>
          <h3 className="text-subhead font-semibold text-label">Pain</h3>
          <Missing>No pain check-ins yet</Missing>
        </>
      )}
      <div className="mt-4 flex flex-col gap-4 border-t border-separator pt-4">
        {entries.isError ? (
          <LoadError onRetry={entries.onRetry} />
        ) : (
          <>
            <BodyMapHeat
              counts={counts}
              caption="Where pain was located, from check-ins and stopped activities"
              emptyText="No pain location reported in this range."
            />
            {types.length > 0 && (
              <div>
                <SubHeading>Type of pain</SubHeading>
                <ul className="mt-1 flex flex-col">
                  {types.map((entry) => (
                    <li key={entry.type} className="flex min-h-11 items-center justify-between gap-3 border-b border-separator py-2 last:border-b-0">
                      <span className="min-w-0 break-words text-body">{painTypeLabels[entry.type]}</span>
                      <span className="shrink-0 text-subhead tabular-nums text-label-secondary">
                        {entry.count === 1 ? '1 check-in' : `${entry.count} check-ins`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function PerMedication({ series, domain, record, entries }: Omit<ChartProps, 'range'> & { record: MedicalRecord; entries: readonly CheckInEntry[] }) {
  const rows = useMemo(() => medicationRows(entries, record.medications, domain), [entries, record.medications, domain]);
  const reports = sideEffectReports(rows);
  if (rows.length === 0) {
    return series && series.points.length > 0 ? <Missing>No per-medication check-ins in this range</Missing> : null;
  }
  return (
    <>
      <div className="flex flex-col gap-2">
        <SubHeading>Each check-in by medication</SubHeading>
        <MedicationStrip key={`${domain.start}-${domain.end}`} rows={rows} domain={domain} />
      </div>
      {reports.length > 0 && (
        <div>
          <SubHeading>Side effects reported</SubHeading>
          <ul className="mt-1 flex flex-col">
            {reports.map((report) => (
              <li key={report.key} className="flex min-h-11 min-w-0 flex-col justify-center border-b border-separator py-2 last:border-b-0">
                <span className="break-words text-body">{quoted(report.text)}</span>
                <span className="break-words text-footnote text-label-secondary">
                  Reported {formatDate(report.t)} · {report.drug}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function MedicationCard({ series, range, domain, record, entries }: ChartProps & { record: MedicalRecord; entries: Loadable<readonly CheckInEntry[]> }) {
  const [today] = useState(() => new Date());
  const current = currentMedications(record.medications, today);
  const changes = medicationChanges(record.timeline, domain);
  const allOrNothing = series !== undefined && series.points.every((point) => point.value === 0 || point.value === 100);
  const singleDrug = allOrNothing && entries.data !== undefined && isSingleDrugAdherence(entries.data, domain);
  return (
    <Card>
      {series ? (
        <>
          <MetricChart series={withDisplayUnit(series)} range={range} domain={domain} title="Medication adherence" formatValue={formatNumber} />
          {singleDrug && <p className="mt-2 text-footnote text-label-secondary">With one medication, each check-in is 0% or 100%.</p>}
        </>
      ) : (
        <>
          <h3 className="text-subhead font-semibold text-label">Medication adherence</h3>
          <Missing>No medication check-ins yet</Missing>
        </>
      )}
      <div className="mt-4 flex flex-col gap-4 border-t border-separator pt-4">
        {entries.isError ? (
          <LoadError onRetry={entries.onRetry} />
        ) : (
          entries.data && <PerMedication series={series} domain={domain} record={record} entries={entries.data} />
        )}
        <div>
          <SubHeading>Current medications</SubHeading>
          {current.length === 0 ? (
            <Missing>None recorded</Missing>
          ) : (
            <ul className="mt-1 flex flex-col">
              {current.map((medication) => (
                <li key={medication.id} className="flex min-h-11 min-w-0 flex-col justify-center border-b border-separator py-2 last:border-b-0">
                  <span className="break-words text-body">{medication.name}</span>
                  <span className="break-words text-footnote text-label-secondary">
                    {medication.dose} · {medication.frequency}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <SubHeading>Medication changes in this range</SubHeading>
          {changes.length === 0 ? (
            <Missing>None</Missing>
          ) : (
            <ul className="mt-1 flex flex-col">
              {changes.map((change) => (
                <li key={change.id} className="flex min-h-11 min-w-0 flex-col justify-center border-b border-separator py-2 last:border-b-0">
                  <span className="break-words text-body">{change.label}</span>
                  <span className="text-footnote text-label-secondary">{formatDate(change.t)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function EpisodesSection({
  range,
  domain,
  record,
  metrics,
  episodes,
}: Omit<ChartProps, 'series'> & { record: MedicalRecord; metrics: readonly PatientMetric[]; episodes: Loadable<readonly Episode[]> }) {
  const loaded = episodes.data;
  const cells = useMemo(() => episodeCalendar(range, domain, loaded ?? [], record.timeline), [range, domain, loaded, record.timeline]);
  const withEpisodes = cellsWithEpisodes(cells);
  const lastT = lastCheckIn(metrics);
  const unitHeader = range === 'W' || range === 'M' ? 'Days with episodes' : 'Weeks with episodes';
  if (episodes.isError) {
    return (
      <Card title="Episodes">
        <LoadError onRetry={episodes.onRetry} />
      </Card>
    );
  }
  return (
    <>
      <Card title="Episodes">
        <EpisodeCalendar key={range} cells={cells} range={range} domain={domain} />
        {withEpisodes.length === 0 && (
          <p className="mt-3 text-subhead text-label-secondary">
            No episodes reported in this range.{lastT ? ` Last check-in ${formatDate(lastT)}.` : ''}
          </p>
        )}
      </Card>
      {withEpisodes.length > 0 && (
        <GroupedList header={unitHeader}>
          {withEpisodes.map((cell) => (
            <GroupedListRow
              key={cell.start}
              title={cellLabel(cell, range)}
              subtitle={cellDetail(cell)}
              value={cell.count > 0 ? <span className="tabular-nums">{episodeCountText(cell.count)}</span> : undefined}
            />
          ))}
        </GroupedList>
      )}
    </>
  );
}

function CompareCard({
  series,
  range,
  domain,
  candidates,
  selected,
  onSelect,
}: ChartProps & { candidates: readonly PatientMetric[]; selected: MetricId | null; onSelect: (metricId: MetricId) => void }) {
  return (
    <Card title="Compare with a score">
      {selected === null ? (
        <Missing>No test or exercise results yet</Missing>
      ) : (
        <div className="flex flex-col gap-4">
          <Select
            label="Score"
            value={selected}
            onChange={(event) => {
              const parsed = metricIdSchema.safeParse(event.target.value);
              if (parsed.success) onSelect(parsed.data);
            }}
          >
            {candidates.map((metric) => (
              <option key={metric.metricId} value={metric.metricId}>
                {metricNames[metric.metricId]}
              </option>
            ))}
          </Select>
          {series ? (
            <MetricChart series={withDisplayUnit(series)} range={range} domain={domain} title={metricNames[selected]} formatValue={formatNumber} />
          ) : (
            <LoadingSkeleton rows={1} />
          )}
        </div>
      )}
    </Card>
  );
}

interface ContentProps {
  patientId: string;
  record: MedicalRecord;
  metrics: readonly PatientMetric[];
  range: MetricRange;
  score: string | null;
  onRangeChange: (range: MetricRange) => void;
  onScoreChange: (metricId: MetricId) => void;
}

function CheckInContent({ patientId, record, metrics, range, score, onRangeChange, onScoreChange }: ContentProps) {
  const [now] = useState(() => Date.now());
  const present = useMemo(() => checkInMetricIds.filter((metricId) => metrics.some((metric) => metric.metricId === metricId)), [metrics]);
  const candidates = useMemo(() => compareCandidates(metrics), [metrics]);
  const parsedScore = metricIdSchema.safeParse(score);
  const selected =
    parsedScore.success && candidates.some((metric) => metric.metricId === parsedScore.data) ? parsedScore.data : defaultCompareMetric(metrics);
  const side = selected !== null && metricDefinitions[selected].lateral ? defaultSide(record) : undefined;

  const requests = useMemo(
    (): SeriesRequest[] => [
      ...present.map((metricId): SeriesRequest => ({ metricId, side: undefined })),
      ...(selected === null ? [] : [{ metricId: selected, side }]),
    ],
    [present, selected, side],
  );
  const results = useMetricSeriesList(patientId, requests, range);
  const flags = usePatientFlags(patientId);
  const checkIns = usePatientCheckIns(patientId, range);
  const episodes = usePatientEpisodes(patientId, range);

  const loaded = results.flatMap((result) => (result.data ? [result.data] : []));
  const entryTimes = [
    ...(checkIns.data?.entries.map((entry) => entry.recordedAt) ?? []),
    ...(episodes.data?.episodes.map((episode) => episode.occurredAt) ?? []),
  ];
  const computed = sharedDomain(range, loaded, now, entryTimes);
  const domain = useMemo((): TimeDomain => ({ start: computed.start, end: computed.end }), [computed.start, computed.end]);

  const pending = results.slice(0, present.length).some((result) => result.isPending) || flags.isPending || checkIns.isPending || episodes.isPending;
  const failed = results.filter((result) => result.isError);

  const seriesFor = (metricId: CheckInMetricId): MetricSeries | undefined => {
    const index = present.indexOf(metricId);
    return index === -1 ? undefined : results[index]?.data;
  };
  const compareSeries = selected === null ? undefined : results[present.length]?.data;
  const entries: Loadable<readonly CheckInEntry[]> = {
    data: checkIns.data?.entries,
    isError: checkIns.isError,
    onRetry: () => void checkIns.refetch(),
  };

  return (
    <>
      <MetricRangeControl value={range} onChange={onRangeChange} />
      {pending ? (
        <LoadingSkeleton rows={3} />
      ) : failed.length > 0 || flags.isError ? (
        <LoadError
          onRetry={() => {
            failed.forEach((result) => void result.refetch());
            if (flags.isError) void flags.refetch();
          }}
        />
      ) : (
        <>
          <PainCard series={seriesFor('pain.intensity')} range={range} domain={domain} flags={flags.data.flags} entries={entries} />
          <MedicationCard series={seriesFor('medication.adherence')} range={range} domain={domain} record={record} entries={entries} />
          <EpisodesSection
            range={range}
            domain={domain}
            record={record}
            metrics={metrics}
            episodes={{ data: episodes.data?.episodes, isError: episodes.isError, onRetry: () => void episodes.refetch() }}
          />
          <CompareCard series={compareSeries} range={range} domain={domain} candidates={candidates} selected={selected} onSelect={onScoreChange} />
        </>
      )}
    </>
  );
}

function CheckInBody({ patientId }: { patientId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const patient = usePatient(patientId);
  const metrics = usePatientMetrics(patientId);
  const parsedRange = metricRangeSchema.safeParse(searchParams.get('range'));
  const range: MetricRange = parsedRange.success ? parsedRange.data : 'M';

  function setParam(key: string, value: string) {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        params.set(key, value);
        return params;
      },
      { replace: true },
    );
  }

  return (
    <main>
      <LargeTitle title="Check-in" back={{ to: `/clinician/patients/${patientId}`, label: patient.data?.patient.name ?? 'Patient' }} />
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
        {patient.isSuccess && metrics.isSuccess && (
          <CheckInContent
            patientId={patientId}
            record={patient.data.record}
            metrics={metrics.data.metrics}
            range={range}
            score={searchParams.get('score')}
            onRangeChange={(next) => setParam('range', next)}
            onScoreChange={(next) => setParam('score', next)}
          />
        )}
      </div>
    </main>
  );
}

export function CheckIn() {
  const { patientId = '' } = useParams();
  return <CheckInBody key={patientId} patientId={patientId} />;
}
