import { useMemo, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  defaultSide,
  metricDefinitions,
  metricIdSchema,
  metricRangeSchema,
  type Flag,
  type MedicalRecord,
  type MetricId,
  type MetricRange,
  type MetricSeries,
  type PatientMetric,
} from '@tempo/shared';
import { Card, GroupedList, GroupedListRow, LargeTitle, MetricChart, MetricRangeControl, Select, type TimeDomain } from '../ui/index.ts';
import { useMetricSeriesList, usePatient, usePatientFlags, usePatientMetrics, type SeriesRequest } from './api.ts';
import { BodyMapHeat } from './BodyMapHeat.tsx';
import {
  cellLabel,
  cellsWithEpisodes,
  checkInMetricIds,
  compareCandidates,
  currentMedications,
  defaultCompareMetric,
  episodeCalendar,
  episodeCountText,
  lastCheckIn,
  medicationChanges,
  painRegionCounts,
  sharedDomain,
  type CheckInMetricId,
} from './checkIn.ts';
import { EpisodeCalendar } from './EpisodeCalendar.tsx';
import { formatDate, formatNumber, formatUnit } from './format.ts';
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

function PainCard({ series, range, domain, flags }: ChartProps & { flags: readonly Flag[] }) {
  const counts = useMemo(() => painRegionCounts(flags, domain), [flags, domain]);
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
      <div className="mt-4 border-t border-separator pt-4">
        <BodyMapHeat
          counts={counts}
          caption="Where pain was reported when an activity was stopped"
          emptyText="No activity was stopped for pain with a location in this range."
        />
      </div>
    </Card>
  );
}

function MedicationCard({ series, range, domain, record }: ChartProps & { record: MedicalRecord }) {
  const [today] = useState(() => new Date());
  const current = currentMedications(record.medications, today);
  const changes = medicationChanges(record.timeline, domain);
  return (
    <Card>
      {series ? (
        <MetricChart series={withDisplayUnit(series)} range={range} domain={domain} title="Medication adherence" formatValue={formatNumber} />
      ) : (
        <>
          <h3 className="text-subhead font-semibold text-label">Medication adherence</h3>
          <Missing>No medication check-ins yet</Missing>
        </>
      )}
      <div className="mt-4 flex flex-col gap-4 border-t border-separator pt-4">
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

function EpisodesSection({ series, range, domain, record, metrics }: ChartProps & { record: MedicalRecord; metrics: readonly PatientMetric[] }) {
  const cells = useMemo(() => episodeCalendar(range, domain, series?.points ?? [], record.timeline), [range, domain, series, record.timeline]);
  const withEpisodes = cellsWithEpisodes(cells);
  const lastT = lastCheckIn(metrics);
  const unitHeader = range === 'W' || range === 'M' ? 'Days with episodes' : 'Weeks with episodes';
  return (
    <>
      <Card title="Episodes">
        {!series && <Missing>No episode check-ins yet</Missing>}
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
              subtitle={cell.falls.length > 0 ? cell.falls.map((fall) => `Fall: ${fall.label}`).join(' · ') : undefined}
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

  const loaded = results.flatMap((result) => (result.data ? [result.data] : []));
  const computed = sharedDomain(range, loaded, now);
  const domain = useMemo((): TimeDomain => ({ start: computed.start, end: computed.end }), [computed.start, computed.end]);

  const checkInPending = results.slice(0, present.length).some((result) => result.isPending);
  const failed = results.filter((result) => result.isError);

  const seriesFor = (metricId: CheckInMetricId): MetricSeries | undefined => {
    const index = present.indexOf(metricId);
    return index === -1 ? undefined : results[index]?.data;
  };
  const compareSeries = selected === null ? undefined : results[present.length]?.data;

  return (
    <>
      <MetricRangeControl value={range} onChange={onRangeChange} />
      {checkInPending || flags.isPending ? (
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
          <PainCard series={seriesFor('pain.intensity')} range={range} domain={domain} flags={flags.data.flags} />
          <MedicationCard series={seriesFor('medication.adherence')} range={range} domain={domain} record={record} />
          <EpisodesSection series={seriesFor('episodes.count')} range={range} domain={domain} record={record} metrics={metrics} />
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
