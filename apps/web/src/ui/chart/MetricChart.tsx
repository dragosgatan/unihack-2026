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
import { edgeInset, plotXScale } from './plotScale.ts';
import { useContainerWidth } from './useContainerWidth.ts';

export interface MetricChartProps {
  series: MetricSeries;
  range: MetricRange;
  title: string;
  formatValue?: (value: number) => string;
  height?: number;
  className?: string;
  label?: string;
  compare?: { series: MetricSeries; label: string };
  target?: { value: number; label: string };
  domain?: TimeDomain;
}

interface PlotPoint {
  t: number;
  value: number;
  x: number;
  y: number;
}

interface PlotLine {
  points: PlotPoint[];
  paths: string[];
  dots: PlotPoint[];
}

interface PlotSession {
  t: number;
  x: number;
  primary: PlotPoint | null;
  compare: PlotPoint | null;
}

interface EndLabel {
  text: string;
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
  compare: PlotLine | null;
  sessions: PlotSession[];
  target: { y: number; label: string } | null;
  endLabels: EndLabel[];
}

interface HeaderValue {
  caption: string;
  value: string;
  unit: string;
}

interface HeaderText extends HeaderValue {
  detail: string;
  second?: HeaderValue;
}

interface GeometryInput {
  series: MetricSeries;
  compare: { series: MetricSeries; label: string } | null;
  label: string;
  target: { value: number; label: string } | null;
  range: MetricRange;
  domain: TimeDomain;
  width: number;
  height: number;
}

const fallbackWidth = 320;
const plotTop = 12;
const axisGutter = 28;
const eventSnapPx = 12;
const minDotSpacingPx = 8;
const endLabelGapPx = 18;
const captionCharPx = 6.5;
const compareDash = '5 4';

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

function visiblePoints(series: MetricSeries, domain: TimeDomain): { t: number; value: number }[] {
  return series.points
    .map((point) => ({ t: Date.parse(point.t), value: point.value }))
    .filter((point) => inDomain(point.t, domain))
    .sort((a, b) => a.t - b.t);
}

function plotLine(
  visible: readonly { t: number; value: number }[],
  x: (t: number) => number,
  y: (value: number) => number,
  skipTimes: readonly number[],
  plotRight: number,
): PlotLine {
  const points = visible.map((point) => ({ ...point, x: x(point.t), y: y(point.value) }));
  const segments = splitAtGaps(points, skipTimes);
  const paths = segments
    .filter((segment) => segment.length > 1)
    .map((segment) => segment.map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`).join(''));
  const roomForDots = points.length <= (plotRight - edgeInset * 2) / minDotSpacingPx;
  const dots = roomForDots ? points : segments.filter((segment) => segment.length === 1).flat();
  return { points, paths, dots };
}

function unionSessions(primary: readonly PlotPoint[], compare: readonly PlotPoint[]): PlotSession[] {
  const byTime = new Map<number, PlotSession>();
  for (const point of primary) byTime.set(point.t, { t: point.t, x: point.x, primary: point, compare: null });
  for (const point of compare) {
    const existing = byTime.get(point.t);
    if (existing) existing.compare = point;
    else byTime.set(point.t, { t: point.t, x: point.x, primary: null, compare: point });
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

function endLabels(primary: PlotLine, compare: PlotLine, labels: [string, string], top: number, bottom: number): EndLabel[] {
  const ends = [primary.points.at(-1), compare.points.at(-1)];
  const [first, second] = ends;
  if (!first || !second || Math.abs(first.y - second.y) < endLabelGapPx) return [];
  const clamp = (value: number) => Math.min(bottom - 4, Math.max(top + 10, value));
  const fitX = (x: number, text: string) => Math.max(x, text.length * captionCharPx);
  const firstAbove = first.y < second.y;
  return [
    { text: labels[0], x: fitX(first.x, labels[0]), y: clamp(firstAbove ? first.y - 10 : first.y + 18) },
    { text: labels[1], x: fitX(second.x, labels[1]), y: clamp(firstAbove ? second.y + 18 : second.y - 10) },
  ];
}

function buildGeometry({ series, compare, label, target, range, domain, width, height }: GeometryInput): Geometry {
  const { x, plotRight } = plotXScale(width, domain);
  const plotBottom = height - axisGutter;

  const visible = visiblePoints(series, domain);
  const visibleCompare = compare ? visiblePoints(compare.series, domain) : [];

  const events = series.events
    .map((event) => ({ event, t: Date.parse(event.t) }))
    .filter((entry) => inDomain(entry.t, domain))
    .sort((a, b) => a.t - b.t)
    .map((entry) => ({ ...entry, x: x(entry.t) }));

  const extent = [...visible, ...visibleCompare].map((point) => point.value);
  if (extent.length > 0) {
    if (!compare && series.baseline !== null) extent.push(series.baseline);
    if (!compare && series.referenceBand) extent.push(series.referenceBand.low, series.referenceBand.high);
    if (target) extent.push(target.value);
  }
  const ticks = extent.length > 0 ? niceTicks(Math.min(...extent), Math.max(...extent)) : [];
  const yDomain: [number, number] = [ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1];
  const y = linearScale(yDomain, [plotBottom, plotTop]);

  const skipTimes = events.filter((entry) => entry.event.type === 'skip').map((entry) => entry.t);
  const primaryLine = plotLine(visible, x, y, skipTimes, plotRight);
  const compareLine = compare ? plotLine(visibleCompare, x, y, skipTimes, plotRight) : null;

  const showY = ticks.length > 0;
  const band = showY && !compare && series.referenceBand ? { top: y(series.referenceBand.high), bottom: y(series.referenceBand.low) } : null;
  const baselineY = showY && !compare && series.baseline !== null ? y(series.baseline) : null;

  return {
    width,
    height,
    plotTop,
    plotRight,
    plotBottom,
    points: primaryLine.points,
    paths: primaryLine.paths,
    dots: primaryLine.dots,
    events,
    yTicks: ticks.map((value) => ({ value, y: y(value) })),
    xTicks: timeTicks(range, domain).map((tick) => ({
      label: tick.label,
      x: x(tick.t),
      anchor: range === 'W' ? 'middle' : 'start',
    })),
    band,
    baselineY,
    compare: compareLine,
    sessions: unionSessions(primaryLine.points, compareLine?.points ?? []),
    target: showY && target ? { y: y(target.value), label: target.label } : null,
    endLabels: compare && compareLine ? endLabels(primaryLine, compareLine, [label, compare.label], plotTop, plotBottom) : [],
  };
}

function crisp(value: number): number {
  return Math.round(value) + 0.5;
}

const StaticLayer = memo(function StaticLayer({ geometry, formatValue }: { geometry: Geometry; formatValue: (value: number) => string }) {
  const { width, plotTop: top, plotRight, plotBottom, points, paths, dots, events, yTicks, xTicks, band, baselineY, compare, target, endLabels: ends } = geometry;
  const lineClass = compare ? 'stroke-chart-primary' : 'stroke-accent';
  const dotClass = compare ? 'fill-chart-primary stroke-surface' : 'fill-accent stroke-surface';
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
      {target && (
        <g>
          <line x1={0} x2={plotRight} y1={crisp(target.y)} y2={crisp(target.y)} strokeWidth={1} strokeDasharray="4 3" className="stroke-label-secondary" />
          <text x={plotRight - 4} y={target.y - 4} textAnchor="end" className="fill-label-secondary text-caption">
            {target.label}
          </text>
        </g>
      )}
      {events
        .filter((entry) => entry.event.type !== 'skip')
        .map((entry) => (
          <line key={entry.event.id} x1={crisp(entry.x)} x2={crisp(entry.x)} y1={top} y2={plotBottom} strokeWidth={1} className="stroke-separator" />
        ))}
      <line x1={0} x2={plotRight} y1={crisp(plotBottom)} y2={crisp(plotBottom)} strokeWidth={1} className="stroke-separator" />
      {compare?.paths.map((d) => (
        <path key={`c-${d}`} d={d} fill="none" strokeWidth={2} strokeDasharray={compareDash} strokeLinejoin="round" strokeLinecap="round" className="stroke-chart-compare" />
      ))}
      {compare?.dots.map((point) => (
        <circle key={`c-${point.t}`} cx={point.x} cy={point.y} r={3.5} strokeWidth={2} className="fill-surface stroke-chart-compare" />
      ))}
      {paths.map((d) => (
        <path key={d} d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className={lineClass} />
      ))}
      {dots.map((point) => (
        <circle key={point.t} cx={point.x} cy={point.y} r={4} strokeWidth={2} className={dotClass} />
      ))}
      {ends.map((end) => (
        <text key={end.text} x={end.x} y={end.y} textAnchor="end" className="fill-label-secondary text-caption font-medium">
          {end.text}
        </text>
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
      {points.length === 0 && (compare?.points.length ?? 0) === 0 && (
        <text x={plotRight / 2} y={(top + plotBottom) / 2} textAnchor="middle" className="fill-label-secondary text-footnote">
          No data in this range
        </text>
      )}
      <rect x={0} y={0} width={width} height={geometry.height} fill="transparent" />
    </g>
  );
});

function average(points: readonly PlotPoint[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

function LegendSwatch({ dashed }: { dashed: boolean }) {
  return (
    <svg width={22} height={10} viewBox="0 0 22 10" aria-hidden="true" className="shrink-0">
      <line
        x1={1}
        x2={21}
        y1={5}
        y2={5}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={dashed ? '4 3' : undefined}
        className={dashed ? 'stroke-chart-compare' : 'stroke-chart-primary'}
      />
      <circle cx={11} cy={5} r={3} strokeWidth={2} className={dashed ? 'fill-surface stroke-chart-compare' : 'fill-chart-primary stroke-chart-primary'} />
    </svg>
  );
}

export function MetricChart({
  series,
  range,
  title,
  formatValue = defaultFormatValue,
  height = 220,
  className,
  label = 'Value',
  compare,
  target,
  domain: sharedDomain,
}: MetricChartProps) {
  const [containerRef, width] = useContainerWidth(fallbackWidth);
  const [now] = useState(() => Date.now());
  const compareSeries = compare?.series;
  const compareLabel = compare?.label;
  const comparing = compare !== undefined;

  const domain = useMemo(() => {
    if (sharedDomain) return sharedDomain;
    const times = [...series.points, ...series.events, ...(compareSeries?.points ?? [])].map((entry) => Date.parse(entry.t));
    return timeDomain(range, latestTime(times, now));
  }, [sharedDomain, series, compareSeries, range, now]);

  const targetValue = target?.value;
  const targetLabel = target?.label;

  const geometry = useMemo(
    () =>
      buildGeometry({
        series,
        compare: compareSeries && compareLabel !== undefined ? { series: compareSeries, label: compareLabel } : null,
        label,
        target: targetValue !== undefined && targetLabel !== undefined ? { value: targetValue, label: targetLabel } : null,
        range,
        domain,
        width,
        height,
      }),
    [series, compareSeries, compareLabel, label, targetValue, targetLabel, range, domain, width, height],
  );

  const primaryAverage = useMemo(() => average(geometry.points), [geometry]);
  const compareAverage = useMemo(() => average(geometry.compare?.points ?? []), [geometry]);

  const rest = useMemo<HeaderText>(() => {
    const detail = dateFormat.formatRange(domain.start, domain.end - 1);
    if (!comparing) {
      return {
        caption: 'Average',
        value: primaryAverage === null ? '—' : formatValue(primaryAverage),
        unit: primaryAverage === null ? '' : series.unit,
        detail,
      };
    }
    const valueOf = (value: number | null, caption: string): HeaderValue => ({
      caption,
      value: value === null ? '—' : formatValue(value),
      unit: value === null ? '' : series.unit,
    });
    return {
      ...valueOf(primaryAverage, label),
      second: valueOf(compareAverage, compareLabel ?? ''),
      detail: `Average · ${detail}`,
    };
  }, [comparing, primaryAverage, compareAverage, formatValue, series.unit, domain, label, compareLabel]);

  const captionRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const unitRef = useRef<HTMLSpanElement>(null);
  const secondCaptionRef = useRef<HTMLSpanElement>(null);
  const secondValueRef = useRef<HTMLSpanElement>(null);
  const secondUnitRef = useRef<HTMLSpanElement>(null);
  const detailRef = useRef<HTMLSpanElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overlayRef = useRef<SVGGElement>(null);
  const crosshairRef = useRef<SVGLineElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const compareDotRef = useRef<SVGCircleElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const pressedRef = useRef(false);
  const frameRef = useRef(0);
  const pendingXRef = useRef(0);
  const indexRef = useRef<number | null>(null);

  const pointXs = useMemo(() => geometry.points.map((point) => point.x), [geometry]);
  const sessionXs = useMemo(() => geometry.sessions.map((session) => session.x), [geometry]);
  const eventXs = useMemo(() => geometry.events.map((entry) => entry.x), [geometry]);

  function writeHeader(text: HeaderText) {
    if (captionRef.current) captionRef.current.textContent = text.caption;
    if (valueRef.current) valueRef.current.textContent = text.value;
    if (unitRef.current) unitRef.current.textContent = text.unit;
    if (detailRef.current) detailRef.current.textContent = text.detail;
    if (text.second) {
      if (secondCaptionRef.current) secondCaptionRef.current.textContent = text.second.caption;
      if (secondValueRef.current) secondValueRef.current.textContent = text.second.value;
      if (secondUnitRef.current) secondUnitRef.current.textContent = text.second.unit;
    }
  }

  function placeMarker(marker: SVGCircleElement | null, dot: PlotPoint | null) {
    if (!marker) return;
    if (dot) {
      marker.setAttribute('cx', String(dot.x));
      marker.setAttribute('cy', String(dot.y));
      marker.setAttribute('visibility', 'visible');
    } else {
      marker.setAttribute('visibility', 'hidden');
    }
  }

  function moveOverlay(x: number, dot: PlotPoint | null, compareDot: PlotPoint | null = null) {
    const overlay = overlayRef.current;
    const crosshair = crosshairRef.current;
    if (!overlay || !crosshair) return;
    const cx = String(crisp(x));
    crosshair.setAttribute('x1', cx);
    crosshair.setAttribute('x2', cx);
    placeMarker(dotRef.current, dot);
    placeMarker(compareDotRef.current, compareDot);
    overlay.setAttribute('visibility', 'visible');
  }

  function clearScrub() {
    indexRef.current = null;
    overlayRef.current?.setAttribute('visibility', 'hidden');
    writeHeader(rest);
  }

  function dateWithEvent(t: number, x: number): string {
    const nearby = geometry.events[nearestIndex(eventXs, x)];
    const date = dateFormat.format(t);
    return nearby && Math.abs(nearby.x - x) <= eventSnapPx ? `${date} · ${eventText(nearby.event)}` : date;
  }

  function showPoint(index: number) {
    const point = geometry.points[index];
    if (!point) return;
    indexRef.current = index;
    moveOverlay(point.x, point);
    writeHeader({
      caption: 'Session',
      value: formatValue(point.value),
      unit: series.unit,
      detail: dateWithEvent(point.t, point.x),
    });
  }

  function showSession(index: number) {
    const session = geometry.sessions[index];
    if (!session) return;
    indexRef.current = index;
    moveOverlay(session.x, session.primary, session.compare);
    const valueOf = (point: PlotPoint | null, caption: string): HeaderValue => ({
      caption,
      value: point ? formatValue(point.value) : '—',
      unit: point ? series.unit : '',
    });
    writeHeader({
      ...valueOf(session.primary, label),
      second: valueOf(session.compare, compareLabel ?? ''),
      detail: dateWithEvent(session.t, session.x),
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
    if (comparing) {
      const index = nearestIndex(sessionXs, x);
      if (index >= 0) showSession(index);
      else clearScrub();
      return;
    }
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
    const count = comparing ? geometry.sessions.length : geometry.points.length;
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
    if (comparing) showSession(next);
    else showPoint(next);
  }

  useLayoutEffect(() => {
    indexRef.current = null;
    overlayRef.current?.setAttribute('visibility', 'hidden');
    writeHeader(rest);
  }, [rest, geometry]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const tableRows = useMemo(() => {
    const withUnit = (point: PlotPoint | null) => (point ? `${formatValue(point.value)} ${series.unit}` : '—');
    const sessionRows = comparing
      ? geometry.sessions.map((session) => ({ key: `s-${session.t}`, t: session.t, values: [withUnit(session.primary), withUnit(session.compare)], note: '' }))
      : geometry.points.map((point) => ({ key: `p-${point.t}`, t: point.t, values: [withUnit(point)], note: '' }));
    const eventRows = geometry.events.map((entry) => {
      const value = entry.event.type === 'skip' ? 'Skipped' : '';
      return {
        key: entry.event.id,
        t: entry.t,
        values: comparing ? [value, value] : [value],
        note:
          entry.event.type === 'skip'
            ? `${entry.event.label} (${skipReasonLabels[entry.event.reason]}, stopped at ${entry.event.stage})`
            : `${eventTypeLabels[entry.event.type]}: ${entry.event.label}`,
      };
    });
    return [...sessionRows, ...eventRows].sort((a, b) => a.t - b.t);
  }, [geometry, comparing, formatValue, series.unit]);

  const summary = comparing
    ? geometry.sessions.length === 0
      ? `${title}, no sessions in this range`
      : `${title}, ${geometry.sessions.length} sessions, ${label} average ${primaryAverage === null ? 'none' : `${formatValue(primaryAverage)} ${series.unit}`}, ${compareLabel ?? ''} average ${compareAverage === null ? 'none' : `${formatValue(compareAverage)} ${series.unit}`}`
    : primaryAverage === null
      ? `${title}, no sessions in this range`
      : `${title}, ${geometry.points.length} sessions, average ${formatValue(primaryAverage)} ${series.unit}`;

  const columns = comparing ? [label, compareLabel ?? ''] : ['Value'];

  return (
    <div className={cx('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex min-w-0 flex-col">
        <h3 className="text-subhead font-semibold text-label">{title}</h3>
        {comparing ? (
          <div className="mt-1 grid min-w-0 grid-cols-2 gap-4">
            <span className="flex min-w-0 flex-col">
              <span ref={captionRef} className="truncate text-caption font-medium text-label-secondary uppercase" />
              <span className="flex min-w-0 items-baseline gap-1">
                <span ref={valueRef} className="truncate text-title-2 font-semibold tabular-nums text-label" />
                <span ref={unitRef} className="shrink-0 text-subhead text-label-secondary" />
              </span>
            </span>
            <span className="flex min-w-0 flex-col">
              <span ref={secondCaptionRef} className="truncate text-caption font-medium text-label-secondary uppercase" />
              <span className="flex min-w-0 items-baseline gap-1">
                <span ref={secondValueRef} className="truncate text-title-2 font-semibold tabular-nums text-label" />
                <span ref={secondUnitRef} className="shrink-0 text-subhead text-label-secondary" />
              </span>
            </span>
          </div>
        ) : (
          <>
            <span ref={captionRef} className="mt-1 truncate text-caption font-medium text-label-secondary uppercase" />
            <span className="flex min-w-0 items-baseline gap-1">
              <span ref={valueRef} className="truncate text-title-1 font-semibold text-label" />
              <span ref={unitRef} className="shrink-0 text-subhead text-label-secondary" />
            </span>
          </>
        )}
        <span ref={detailRef} className="truncate text-caption text-label-secondary" />
      </div>
      {comparing && (
        <ul aria-hidden="true" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-footnote text-label-secondary">
          <li className="flex items-center gap-1.5">
            <LegendSwatch dashed={false} />
            {label}
          </li>
          <li className="flex items-center gap-1.5">
            <LegendSwatch dashed />
            {compareLabel}
          </li>
        </ul>
      )}
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
            {comparing && <circle ref={compareDotRef} r={5.5} strokeWidth={2.5} className="fill-surface stroke-chart-compare" />}
            <circle ref={dotRef} r={6} strokeWidth={2} className={comparing ? 'fill-chart-primary stroke-surface' : 'fill-accent stroke-surface'} />
          </g>
        </svg>
      </div>
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.key}>
                <td>{dateFormat.format(row.t)}</td>
                {row.values.map((value, index) => (
                  <td key={columns[index] ?? index}>{value}</td>
                ))}
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
