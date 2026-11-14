import { useMemo } from 'react';
import type { MedicalRecord, MetricId, MetricRange, MetricSeries, PatientMetric, Side } from '@tempo/shared';
import { useMetricSeriesList, type SeriesRequest } from './api.ts';
import { metricNames } from './metricNames.ts';
import { affectedSide, deriveSymmetrySeries, otherSide, symmetryApplies, symmetryMetricId, symmetrySource } from './symmetry.ts';

export interface SymmetrySeries {
  series: MetricSeries;
  measure: string;
}

function measureName(sourceMetricId: MetricId): string {
  return sourceMetricId === symmetryMetricId ? metricNames[symmetryMetricId] : `${metricNames[sourceMetricId]}, affected side as a percentage of the other`;
}

function symmetryRequests(sourceMetricId: MetricId | null, affected: Side | null): SeriesRequest[] {
  if (sourceMetricId === null || affected === null) return [];
  if (sourceMetricId === symmetryMetricId) return [{ metricId: symmetryMetricId, side: undefined }];
  return [
    { metricId: sourceMetricId, side: affected },
    { metricId: sourceMetricId, side: otherSide(affected) },
  ];
}

export function useSymmetrySeries(patientId: string, record: MedicalRecord, metrics: readonly PatientMetric[], range: MetricRange) {
  const affected = affectedSide(record);
  const applies = affected !== null && symmetryApplies(record, metrics);
  const source = applies ? symmetrySource(metrics) : null;
  const sourceMetricId = source === null ? null : source.kind === 'server' ? symmetryMetricId : source.metricId;
  const requests = symmetryRequests(sourceMetricId, affected);
  const results = useMetricSeriesList(patientId, requests, range);
  const pending = results.some((result) => result.isPending);
  const failed = results.filter((result) => result.isError);
  const retry = () => failed.forEach((result) => void result.refetch());
  const firstData = results[0]?.data;
  const secondData = results[1]?.data;
  const value = useMemo((): SymmetrySeries | null => {
    if (sourceMetricId === null || !firstData) return null;
    if (sourceMetricId === symmetryMetricId) return { series: firstData, measure: measureName(sourceMetricId) };
    return secondData ? { series: deriveSymmetrySeries(firstData, secondData), measure: measureName(sourceMetricId) } : null;
  }, [sourceMetricId, firstData, secondData]);
  return { applies, pending, failed: failed.length > 0, retry, value };
}
