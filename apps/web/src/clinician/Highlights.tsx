import { useMemo, useState } from 'react';
import type { MedicalRecord, MetricSeries } from '@tempo/shared';
import { Card, EmptyState, MiniChart } from '../ui/index.ts';
import { usePatientMetrics, useMetricSeriesList } from './api.ts';
import { metricDomains, type Domain } from './domains.ts';
import { defaultSide } from './format.ts';
import { highlightsFrom, type Highlight } from './highlights.ts';
import { DomainIcon } from './icons.tsx';
import { metricNames } from './metricNames.ts';
import { LoadError, LoadingSkeleton } from './states.tsx';

const domainTextTints: Record<Domain, string> = {
  memory: 'text-cat-memory',
  attention: 'text-cat-attention',
  executive: 'text-cat-executive',
  motor: 'text-cat-motor',
  mobility: 'text-cat-mobility',
  'check-in': 'text-accent',
};

function HighlightCard({ patientId, highlight, now }: { patientId: string; highlight: Highlight; now: number }) {
  const domain = metricDomains[highlight.metricId];
  return (
    <Card
      href={`/clinician/patients/${patientId}/metrics/${highlight.metricId}`}
      title={
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`size-4 shrink-0 [&>svg]:size-full ${domainTextTints[domain]}`}>
            <DomainIcon domain={domain} />
          </span>
          <span className="truncate">{metricNames[highlight.metricId]}</span>
        </span>
      }
    >
      <p className="text-headline text-label">{highlight.sentence}</p>
      <MiniChart series={highlight.series} now={now} className="mt-3" />
    </Card>
  );
}

function HighlightCards({ patientId, record }: { patientId: string; record: MedicalRecord }) {
  const metrics = usePatientMetrics(patientId);
  const [now] = useState(() => Date.now());
  const requests = useMemo(
    () =>
      (metrics.data?.metrics ?? []).map((metric) => ({
        metricId: metric.metricId,
        side: metric.lateral ? defaultSide(record) : undefined,
      })),
    [metrics.data, record],
  );
  const results = useMetricSeriesList(patientId, requests, 'M');
  const settled = results.every((result) => !result.isPending);
  const loaded = results.flatMap((result): MetricSeries[] => (result.data ? [result.data] : []));
  const failed = results.filter((result) => result.isError);

  if (metrics.isPending || !settled) return <LoadingSkeleton rows={2} />;
  if (metrics.isError) return <LoadError onRetry={() => void metrics.refetch()} />;
  if (results.length > 0 && loaded.length === 0) {
    return <LoadError onRetry={() => failed.forEach((result) => void result.refetch())} />;
  }
  const highlights = highlightsFrom(loaded, now);
  if (highlights.length === 0) {
    return <EmptyState title="No highlights yet" message="Findings appear here once there are a few sessions to compare." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {highlights.map((highlight) => (
        <HighlightCard key={highlight.metricId} patientId={patientId} highlight={highlight} now={now} />
      ))}
    </div>
  );
}

export function Highlights({ patientId, record }: { patientId: string; record: MedicalRecord }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title-3 font-semibold">Highlights</h2>
      <HighlightCards patientId={patientId} record={record} />
    </section>
  );
}
