import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { MetricRange } from '@tempo/shared';
import { plotXScale, useContainerWidth, type TimeDomain } from '../ui/index.ts';
import { cellLabel, episodeCountText, heatFillClasses, heatLevel, type CalendarCell } from './checkIn.ts';
import { HeatLegend } from './HeatLegend.tsx';

export interface EpisodeCalendarProps {
  cells: readonly CalendarCell[];
  range: MetricRange;
  domain: TimeDomain;
}

const fallbackWidth = 320;
const height = 40;
const cellTop = 4;
const cellHeight = 20;
const markerY = 32;

function cellDetail(cell: CalendarCell, range: MetricRange): string {
  const parts = [cellLabel(cell, range), episodeCountText(cell.count), ...cell.falls.map((fall) => `Fall: ${fall.label}`)];
  return parts.join(' · ');
}

function FallMarker({ x, y }: { x: number; y: number }) {
  return <rect x={x - 3.5} y={y - 3.5} width={7} height={7} rx={1} transform={`rotate(45 ${x} ${y})`} className="fill-critical" />;
}

export function EpisodeCalendar({ cells, range, domain }: EpisodeCalendarProps) {
  const [containerRef, width] = useContainerWidth(fallbackWidth);
  const [active, setActive] = useState<number | null>(null);
  const pressedRef = useRef(false);
  const { x } = plotXScale(width, domain);
  const unit = range === 'W' || range === 'M' ? 'day' : 'week';

  const boxes = cells.map((cell) => {
    const x0 = x(cell.start);
    const x1 = x(cell.end);
    const gap = x1 - x0 > 4 ? 1 : 0;
    return { cell, x0, x1, left: x0 + gap, width: Math.max(1, x1 - x0 - gap * 2) };
  });

  function indexAt(clientX: number, svg: SVGSVGElement): number {
    const rect = svg.getBoundingClientRect();
    const px = rect.width > 0 ? ((clientX - rect.left) * width) / rect.width : clientX - rect.left;
    const found = boxes.findIndex((box) => px >= box.x0 && px < box.x1);
    if (found !== -1) return found;
    return px < (boxes[0]?.x0 ?? 0) ? 0 : boxes.length - 1;
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (boxes.length === 0) return;
    pressedRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setActive(indexAt(event.clientX, event.currentTarget));
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (pressedRef.current) setActive(indexAt(event.clientX, event.currentTarget));
  }

  function handlePointerUp() {
    pressedRef.current = false;
  }

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (boxes.length === 0) return;
    const last = boxes.length - 1;
    const current = active ?? last;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = active === null ? last : Math.max(0, current - 1);
    else if (event.key === 'ArrowRight') next = active === null ? last : Math.min(last, current + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  const activeBox = active === null ? undefined : boxes[active];
  const totalEpisodes = cells.reduce((sum, cell) => sum + cell.count, 0);
  const totalFalls = cells.reduce((sum, cell) => sum + cell.falls.length, 0);
  const summary = `Episode calendar, one cell per ${unit}, ${episodeCountText(totalEpisodes)}, ${totalFalls === 1 ? '1 fall' : `${totalFalls} falls`}. Use the arrow keys to read each ${unit}.`;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div ref={containerRef} className="min-w-0">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={summary}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className="block touch-pan-y select-none rounded-control [-webkit-touch-callout:none] [-webkit-user-select:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          {boxes.map((box) => (
            <rect key={box.cell.start} x={box.left} y={cellTop} width={box.width} height={cellHeight} rx={2} className={heatFillClasses[heatLevel(box.cell.count)]} />
          ))}
          {boxes
            .filter((box) => box.cell.falls.length > 0)
            .map((box) => (
              <FallMarker key={`fall-${box.cell.start}`} x={(box.x0 + box.x1) / 2} y={markerY} />
            ))}
          {activeBox && (
            <rect
              x={activeBox.left - 1.5}
              y={cellTop - 1.5}
              width={activeBox.width + 3}
              height={cellHeight + 3}
              rx={3}
              fill="none"
              strokeWidth={1.5}
              className="stroke-label"
            />
          )}
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
        </svg>
      </div>
      <p aria-live="polite" className="min-h-[1.125rem] break-words text-footnote text-label-secondary">
        {activeBox ? cellDetail(activeBox.cell, range) : `Tap a ${unit} to see its episodes`}
      </p>
      <HeatLegend>
        <li className="flex items-center gap-1">
          <svg width={12} height={12} viewBox="0 0 12 12" className="shrink-0">
            <FallMarker x={6} y={6} />
          </svg>
          Fall
        </li>
      </HeatLegend>
    </div>
  );
}
