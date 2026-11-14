import { useMemo } from 'react';
import type { MetricSeries } from '@tempo/shared';
import { cx } from '../cx.ts';
import { inDomain, linearScale, splitAtGaps, timeDomain } from './scale.ts';
import { useContainerWidth } from './useContainerWidth.ts';

export interface MiniChartProps {
  series: MetricSeries;
  now: number;
  height?: number;
  className?: string;
}

const fallbackWidth = 280;
const edgeInset = 5;
const plotTop = 5;
const skipRowHeight = 12;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildMiniGeometry(series: MetricSeries, now: number, width: number, height: number) {
  const domain = timeDomain('M', now);
  const plotBottom = height - skipRowHeight;
  const x = linearScale([domain.start, domain.end], [edgeInset, width - edgeInset]);

  const visible = series.points
    .map((point) => ({ t: Date.parse(point.t), value: point.value }))
    .filter((point) => inDomain(point.t, domain))
    .sort((a, b) => a.t - b.t);
  const skipTimes = series.events
    .filter((event) => event.type === 'skip')
    .map((event) => Date.parse(event.t))
    .filter((t) => inDomain(t, domain));

  const extent = visible.map((point) => point.value);
  if (visible.length > 0 && series.referenceBand) extent.push(series.referenceBand.low, series.referenceBand.high);
  const min = extent.length > 0 ? Math.min(...extent) : 0;
  const max = extent.length > 0 ? Math.max(...extent) : 1;
  const y = linearScale([min, max], [plotBottom - edgeInset, plotTop]);

  const points = visible.map((point) => ({ t: point.t, x: x(point.t), y: y(point.value) }));
  const segments = splitAtGaps(points, skipTimes);
  const paths = segments
    .filter((segment) => segment.length > 1)
    .map((segment) => segment.map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`).join(''));
  const latest = points[points.length - 1];
  const lonePoints = segments.filter((segment) => segment.length === 1).flat().filter((point) => point !== latest);
  const band =
    visible.length > 0 && series.referenceBand
      ? { top: y(series.referenceBand.high), bottom: y(series.referenceBand.low) }
      : null;

  return {
    plotBottom,
    paths,
    lonePoints,
    latest,
    band,
    skips: skipTimes.map((t) => ({ t, x: x(t) })),
  };
}

export function MiniChart({ series, now, height = 64, className }: MiniChartProps) {
  const [containerRef, width] = useContainerWidth(fallbackWidth);
  const geometry = useMemo(() => buildMiniGeometry(series, now, width, height), [series, now, width, height]);
  const { band, paths, lonePoints, latest, skips } = geometry;

  return (
    <div ref={containerRef} className={cx('min-w-0', className)} aria-hidden="true">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible">
        {band && <rect x={0} y={band.top} width={width} height={Math.max(0, band.bottom - band.top)} rx={4} className="fill-accent/10" />}
        {paths.map((d) => (
          <path key={d} d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-accent" />
        ))}
        {lonePoints.map((point) => (
          <circle key={point.t} cx={point.x} cy={point.y} r={2.5} className="fill-accent" />
        ))}
        {latest && <circle cx={latest.x} cy={latest.y} r={4.5} strokeWidth={2} className="fill-accent stroke-surface" />}
        {skips.map((skip) => (
          <circle key={skip.t} cx={skip.x} cy={height - 5} r={3} strokeWidth={1.5} className="fill-surface stroke-label-secondary" />
        ))}
      </svg>
    </div>
  );
}
