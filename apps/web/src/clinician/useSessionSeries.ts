import { useMemo } from 'react';
import type { PatientMetric } from '@tempo/shared';
import { useMetricSeriesList } from './api.ts';
import { summaryRequests, type FetchedSeries } from './sessionSummary.ts';

const emptyMetrics: readonly PatientMetric[] = [];

export function useSessionSeries(patientId: string, metrics: readonly PatientMetric[] | undefined) {
  const requests = useMemo(() => summaryRequests(metrics ?? emptyMetrics), [metrics]);
  const results = useMetricSeriesList(patientId, requests, 'Y');
  const pending = metrics === undefined || results.some((result) => result.isPending);
  const failed = results.filter((result) => result.isError);
  const retry = () => failed.forEach((result) => void result.refetch());
  const fetched = requests.flatMap((request, index): FetchedSeries[] => {
    const series = results[index]?.data;
    return series ? [{ side: request.side, series }] : [];
  });
  return { pending, failed: failed.length > 0, retry, fetched };
}
