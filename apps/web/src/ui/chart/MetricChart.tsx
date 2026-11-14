import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { MetricEvent, MetricRange, MetricSeries, SkipReason } from '@tempo/shared';
import { cx } from '../cx.ts';
import {
  chartLocale,
  inDomain,
  latestTime,
  linearScale,
  nearestIndex,
  niceTicks,
  splitAtGaps,
  timeDomain,
  timeTicks,
  type TimeDomain,
} from './scale.ts';

export interface MetricChartProps {
  series: MetricSeries;
  range: MetricRange;
  title: string;
  formatValue?: (value: number) => string;
  height?: number;
  className?: string;
}

interface PlotPoint {
  t: number;
  value: number;
  x: number;
  y: number;
}

interface PlotEvent {
  event: MetricEvent;
  t: number;
  x: number;
}

interface Geometry {
  width: number;
  height: number;
  plotTop: number;
  plotRight: number;
  plotBottom: number;
  points: PlotPoint[];
  paths: string[];
  dots: PlotPoint[];
  events: PlotEvent[];
  yTicks: { value: number; y: number }[];
  xTicks: { label: string; x: number; anchor: 'start' | 'middle' }[];
  band: { top: number; bottom: number } | null;
  baselineY: number | null;
}

interface HeaderText {
  caption: string;
  value: string;
  unit: string;
  detail: string;
}

const fallbackWidth = 320;
const yLabelGutter = 40;
const plotTop = 12;
const axisGutter = 28;
const edgeInset = 6;
const eventSnapPx = 12;
const minDotSpacingPx = 8;

const eventTypeLabels: Record<MetricEvent['type'], string> = {
  'medication-change': 'Medication change',
  surgery: 'Surgery',
  fall: 'Fall',
  milestone: 'Milestone',
  'plan-change': 'Plan change',
  'baseline-reset': 'Baseline reset',
  'phase-change': 'Phase change',
  other: 'Event',
  skip: 'Skipped',
};

const skipReasonLabels: Record<SkipReason, string> = {
  pain: 'pain',
  tired: 'tired',
  'not-understood': 'did not understand',
  'cannot-see-or-hear': 'could not see or hear',
  'physically-unable': 'physically unable',
  'device-problem': 'device problem',
  other: 'other',
};

const dateFormat = new Intl.DateTimeFormat(chartLocale, { day: 'numeric', month: 'short', year: 'numeric' });
const defaultNumberFormat = new Intl.NumberFormat(chartLocale, { maximumFractionDigits: 1 });

function defaultFormatValue(value: number): string {
  return defaultNumberFormat.format(value);
}

function eventText(event: MetricEvent): string {
  return event.type === 'skip' ? `Skipped — ${event.label}` : event.label;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildGeometry(series: MetricSeries, range: MetricRange, domain: TimeDomain, width: number, height: number): Geometry {
  const plotRight = width - yLabelGutter;
  const plotBottom = height - axisGutter;
  const x = linearScale([domain.start, domain.end], [edgeInset, plotRight - edgeInset]);

  const visible = series.points
    .map((point) => ({ t: Date.parse(point.t), value: point.value }))
    .filter((point) => inDomain(point.t, domain))
    .sort((a, b) => a.t - b.t);

  const events = series.events
    .map((event) => ({ event, t: Date.parse(event.t) }))
    .filter((entry) => inDomain(entry.t, domain))
    .sort((a, b) => a.t - b.t)
    .map((entry) => ({ ...entry, x: x(entry.t) }));

  const extent = visible.map((point) => point.value);
  if (visible.length > 0) {
    if (series.baseline !== null) extent.push(series.baseline);
    if (series.referenceBand) extent.push(series.referenceBand.low, series.referenceBand.high);
  }
  const ticks = extent.length > 0 ? niceTicks(Math.min(...extent), Math.max(...extent)) : [];
  const yDomain: [number, number] = [ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1];
  const y = linearScale(yDomain, [plotBottom, plotTop]);

  const points = visible.map((point) => ({ ...point, x: x(point.t), y: y(point.value) }));
  const skipTimes = events.filter((entry) => entry.event.type === 'skip').map((entry) => entry.t);
  const segments = splitAtGaps(points, skipTimes);
  const paths = segments
    .filter((segment) => segment.length > 1)
    .map((segment) => segment.map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`).join(''));
  const roomForDots = points.length <= (plotRight - edgeInset * 2) / minDotSpacingPx;
  const dots = roomForDots ? points : segments.filter((segment) => segment.length === 1).flat();

  const showY = ticks.length > 0;
  const band = showY && series.referenceBand ? { top: y(series.referenceBand.high), bottom: y(series.referenceBand.low) } : null;
  const baselineY = showY && series.baseline !== null ? y(series.baseline) : null;

  return {
    width,
    height,
    plotTop,
    plotRight,
    plotBottom,
    points,
    paths,
    dots,
    events,
    yTicks: ticks.map((value) => ({ value, y: y(value) })),
    xTicks: timeTicks(range, domain).map((tick) => ({
      label: tick.label,
      x: x(tick.t),
      anchor: range === 'W' ? 'middle' : 'start',
    })),
    band,
    baselineY,
  };
}

function crisp(value: number): number {
  return Math.round(value) + 0.5;
}

const StaticLayer = memo(function StaticLayer({ geometry, formatValue }: { geometry: Geometry; formatValue: (value: number) => string }) {
  const { width, plotTop: top, plotRight, plotBottom, points, paths, dots, events, yTicks, xTicks, band, baselineY } = geometry;
  return (
    <g>
      {band && (
        <g>
          <rect x={0} y={band.top} width={plotRight} height={Math.max(0, band.bottom - band.top)} className="fill-accent/10" />
          <text x={4} y={band.top + 12} className="fill-label-secondary text-caption">
            own range
          </text>
        </g>
      )}
      {yTicks.map((tick) => (
        <g key={tick.value}>
          <line x1={0} x2={plotRight} y1={crisp(tick.y)} y2={crisp(tick.y)} strokeWidth={1} className="stroke-separator" />
          <text x={plotRight + 6} y={tick.y + 4} className="fill-label-secondary text-caption tabular-nums">
            {formatValue(tick.value)}
          </text>
        </g>
      ))}
      {baselineY !== null && (
        <g>
          <line x1={0} x2={plotRight} y1={crisp(baselineY)} y2={crisp(baselineY)} strokeWidth={1} className="stroke-label-secondary" />
          <text x={plotRight - 4} y={baselineY - 4} textAnchor="end" className="fill-label-secondary text-caption">
            baseline
          </text>
        </g>
      )}
      {events
        .filter((entry) => entry.event.type !== 'skip')
        .map((entry) => (
          <line key={entry.event.id} x1={crisp(entry.x)} x2={crisp(entry.x)} y1={top} y2={plotBottom} strokeWidth={1} className="stroke-separator" />
        ))}
      <line x1={0} x2={plotRight} y1={crisp(plotBottom)} y2={crisp(plotBottom)} strokeWidth={1} className="stroke-separator" />
      {paths.map((d) => (
        <path key={d} d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-accent" />
      ))}
      {dots.map((point) => (
        <circle key={point.t} cx={point.x} cy={point.y} r={4} strokeWidth={2} className="fill-accent stroke-surface" />
      ))}
      {events.map((entry) =>
        entry.event.type === 'skip' ? (
          <circle key={entry.event.id} cx={entry.x} cy={plotBottom} r={4} strokeWidth={1.5} className="fill-surface stroke-label-secondary" />
        ) : (
          <rect
            key={entry.event.id}
            x={entry.x - 3.5}
            y={plotBottom - 3.5}
            width={7}
            height={7}
            rx={1}
            transform={`rotate(45 ${entry.x} ${plotBottom})`}
            className={entry.event.type === 'fall' ? 'fill-critical' : 'fill-label-secondary'}
          />
        ),
      )}
      {xTicks.map((tick) => (
        <text
          key={`${tick.x}-${tick.label}`}
          x={tick.anchor === 'start' ? tick.x + 2 : tick.x}
          y={geometry.height - 6}
          textAnchor={tick.anchor}
          className="fill-label-secondary text-caption"
        >
          {tick.label}
        </text>
      ))}
      {points.length === 0 && (
        <text x={plotRight / 2} y={(top + plotBottom) / 2} textAnchor="middle" className="fill-label-secondary text-footnote">
          No data in this range
        </text>
      )}
      <rect x={0} y={0} width={width} height={geometry.height} fill="transparent" />
    </g>
  );
});

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallbackWidth);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const next = element.clientWidth;
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function MetricChart({ series, range, title, formatValue = defaultFormatValue, height = 220, className }: MetricChartProps) {
  const [containerRef, width] = useContainerWidth();
  const [now] = useState(() => Date.now());

  const domain = useMemo(() => {
    const times = [...series.points, ...series.events].map((entry) => Date.parse(entry.t));
    return timeDomain(range, latestTime(times, now));
  }, [series, range, now]);

  const geometry = useMemo(() => buildGeometry(series, range, domain, width, height), [series, range, domain, width, height]);

  const average = useMemo(() => {
    if (geometry.points.length === 0) return null;
    return geometry.points.reduce((sum, point) => sum + point.value, 0) / geometry.points.length;
  }, [geometry]);

  const rest = useMemo<HeaderText>(
    () => ({
      caption: 'Average',
      value: average === null ? '—' : formatValue(average),
      unit: average === null ? '' : series.unit,
      detail: dateFormat.formatRange(domain.start, domain.end - 1),
    }),
    [average, formatValue, series.unit, domain],
  );

  const captionRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const unitRef = useRef<HTMLSpanElement>(null);
  const detailRef = useRef<HTMLSpanElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overlayRef = useRef<SVGGElement>(null);
  const crosshairRef = useRef<SVGLineElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const pressedRef = useRef(false);
  const frameRef = useRef(0);
  const pendingXRef = useRef(0);
  const indexRef = useRef<number | null>(null);

  const pointXs = useMemo(() => geometry.points.map((point) => point.x), [geometry]);
  const eventXs = useMemo(() => geometry.events.map((entry) => entry.x), [geometry]);

  function writeHeader(text: HeaderText) {
    if (captionRef.current) captionRef.current.textContent = text.caption;
    if (valueRef.current) valueRef.current.textContent = text.value;
    if (unitRef.current) unitRef.current.textContent = text.unit;
    if (detailRef.current) detailRef.current.textContent = text.detail;
  }

  function moveOverlay(x: number, dot: PlotPoint | null) {
    const overlay = overlayRef.current;
    const crosshair = crosshairRef.current;
    const marker = dotRef.current;
    if (!overlay || !crosshair || !marker) return;
    const cx = String(crisp(x));
    crosshair.setAttribute('x1', cx);
    crosshair.setAttribute('x2', cx);
    if (dot) {
      marker.setAttribute('cx', String(dot.x));
      marker.setAttribute('cy', String(dot.y));
      marker.setAttribute('visibility', 'visible');
    } else {
      marker.setAttribute('visibility', 'hidden');
    }
    overlay.setAttribute('visibility', 'visible');
  }

  function clearScrub() {
    indexRef.current = null;
    overlayRef.current?.setAttribute('visibility', 'hidden');
    writeHeader(rest);
  }

  function showPoint(index: number) {
    const point = geometry.points[index];
    if (!point) return;
    indexRef.current = index;
    const nearbyIndex = nearestIndex(eventXs, point.x);
    const nearby = geometry.events[nearbyIndex];
    const date = dateFormat.format(point.t);
    moveOverlay(point.x, point);
    writeHeader({
      caption: 'Session',
      value: formatValue(point.value),
      unit: series.unit,
      detail: nearby && Math.abs(nearby.x - point.x) <= eventSnapPx ? `${date} · ${eventText(nearby.event)}` : date,
    });
  }

  function showEvent(entry: PlotEvent) {
    moveOverlay(entry.x, null);
    writeHeader({
      caption: eventTypeLabels[entry.event.type],
      value: eventText(entry.event),
      unit: '',
      detail: dateFormat.format(entry.t),
    });
  }

  function scrubTo(x: number) {
    const pointIndex = nearestIndex(pointXs, x);
    const point = geometry.points[pointIndex];
    const entry = geometry.events[nearestIndex(eventXs, x)];
    const eventDistance = entry ? Math.abs(entry.x - x) : Infinity;
    const pointDistance = point ? Math.abs(point.x - x) : Infinity;
    if (entry && eventDistance <= eventSnapPx && eventDistance < pointDistance) {
      indexRef.current = point ? pointIndex : null;
      showEvent(entry);
    } else if (point) {
      showPoint(pointIndex);
    } else {
      clearScrub();
    }
  }

  function scheduleScrub(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    rectRef.current ??= svg.getBoundingClientRect();
    const rect = rectRef.current;
    pendingXRef.current = rect.width > 0 ? ((clientX - rect.left) * geometry.width) / rect.width : clientX - rect.left;
    if (frameRef.current !== 0) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      scrubTo(pendingXRef.current);
    });
  }

  function endScrub() {
    pressedRef.current = false;
    rectRef.current = null;
    if (frameRef.current !== 0) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    clearScrub();
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pressedRef.current = true;
    rectRef.current = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    scheduleScrub(event.clientX);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (pressedRef.current || event.pointerType === 'mouse') scheduleScrub(event.clientX);
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    pressedRef.current = false;
    if (event.pointerType !== 'mouse') endScrub();
  }

  function handlePointerLeave(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'mouse' && !pressedRef.current) endScrub();
  }

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const count = geometry.points.length;
    if (event.key === 'Escape') {
      clearScrub();
      return;
    }
    if (count === 0 || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
    event.preventDefault();
    const current = indexRef.current;
    const next =
      event.key === 'ArrowRight'
        ? current === null
          ? 0
          : Math.min(count - 1, current + 1)
        : current === null
          ? count - 1
          : Math.max(0, current - 1);
    showPoint(next);
  }

  useLayoutEffect(() => {
    indexRef.current = null;
    overlayRef.current?.setAttribute('visibility', 'hidden');
    writeHeader(rest);
  }, [rest, geometry]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const tableRows = useMemo(() => {
    const rows = [
      ...geometry.points.map((point) => ({ key: `p-${point.t}`, t: point.t, value: `${formatValue(point.value)} ${series.unit}`, note: '' })),
      ...geometry.events.map((entry) => ({
        key: entry.event.id,
        t: entry.t,
        value: entry.event.type === 'skip' ? 'Skipped' : '',
        note:
          entry.event.type === 'skip'
            ? `${entry.event.label} (${skipReasonLabels[entry.event.reason]}, stopped at ${entry.event.stage})`
            : `${eventTypeLabels[entry.event.type]}: ${entry.event.label}`,
      })),
    ];
    return rows.sort((a, b) => a.t - b.t);
  }, [geometry, formatValue, series.unit]);

  const summary =
    average === null
      ? `${title}, no sessions in this range`
      : `${title}, ${geometry.points.length} sessions, average ${formatValue(average)} ${series.unit}`;

  return (
    <div className={cx('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex min-w-0 flex-col">
        <h3 className="text-subhead font-semibold text-label">{title}</h3>
        <span ref={captionRef} className="mt-1 truncate text-caption font-medium text-label-secondary uppercase" />
        <span className="flex min-w-0 items-baseline gap-1">
          <span ref={valueRef} className="truncate text-title-1 font-semibold text-label" />
          <span ref={unitRef} className="shrink-0 text-subhead text-label-secondary" />
        </span>
        <span ref={detailRef} className="truncate text-caption text-label-secondary" />
      </div>
      <div ref={containerRef} className="min-w-0">
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${geometry.width} ${height}`}
          role="group"
          aria-label={summary}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={endScrub}
          onPointerLeave={handlePointerLeave}
          onKeyDown={handleKeyDown}
          onBlur={clearScrub}
          className="block touch-pan-y overflow-visible select-none [-webkit-touch-callout:none] [-webkit-user-select:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent rounded-control"
        >
          <StaticLayer geometry={geometry} formatValue={formatValue} />
          <g ref={overlayRef} visibility="hidden" pointerEvents="none">
            <line ref={crosshairRef} y1={geometry.plotTop} y2={geometry.plotBottom} strokeWidth={1} className="stroke-label-secondary" />
            <circle ref={dotRef} r={6} strokeWidth={2} className="fill-accent stroke-surface" />
          </g>
        </svg>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Value</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row) => (
            <tr key={row.key}>
              <td>{dateFormat.format(row.t)}</td>
              <td>{row.value}</td>
              <td>{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
