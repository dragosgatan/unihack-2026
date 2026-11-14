import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { MedicationStatus } from '@tempo/shared';
import { plotXScale, useContainerWidth, type TimeDomain } from '../ui/index.ts';
import { quoted, rowName, type MedicationMark, type MedicationRow } from './checkIn.ts';
import { medicationStatusLabels } from './checkInLabels.ts';
import { formatDate } from './format.ts';

export interface MedicationStripProps {
  rows: readonly MedicationRow[];
  domain: TimeDomain;
}

const fallbackWidth = 320;
const rowHeight = 24;
const midY = rowHeight / 2;
const statusOrder: readonly MedicationStatus[] = ['taken', 'missed', 'stopped'];

function StatusMark({ status, x, y }: { status: MedicationStatus; x: number; y: number }) {
  if (status === 'taken') return <circle cx={x} cy={y} r={4.5} className="fill-positive" />;
  if (status === 'missed') {
    return (
      <path d={`M${x - 4} ${y - 4}L${x + 4} ${y + 4}M${x + 4} ${y - 4}L${x - 4} ${y + 4}`} strokeWidth={2} strokeLinecap="round" className="stroke-warning" />
    );
  }
  return <rect x={x - 4} y={y - 4} width={8} height={8} rx={1} className="fill-label-secondary" />;
}

function markDetail(row: MedicationRow, mark: MedicationMark): string {
  const parts = [formatDate(mark.t), rowName(row), medicationStatusLabels[mark.status]];
  if (mark.sideEffects !== undefined) parts.push(`Side effects reported: ${quoted(mark.sideEffects)}`);
  return parts.join(' · ');
}

interface ActiveMark {
  row: number;
  index: number;
}

function StripRow({
  row,
  rowIndex,
  width,
  domain,
  active,
  onActive,
}: {
  row: MedicationRow;
  rowIndex: number;
  width: number;
  domain: TimeDomain;
  active: number | null;
  onActive: (mark: ActiveMark | null) => void;
}) {
  const pressedRef = useRef(false);
  const { x, plotRight } = plotXScale(width, domain);
  const xs = row.marks.map((mark) => x(Date.parse(mark.t)));

  function indexAt(clientX: number, svg: SVGSVGElement): number {
    const rect = svg.getBoundingClientRect();
    const px = rect.width > 0 ? ((clientX - rect.left) * width) / rect.width : clientX - rect.left;
    let best = 0;
    xs.forEach((value, index) => {
      if (Math.abs(value - px) < Math.abs((xs[best] ?? 0) - px)) best = index;
    });
    return best;
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (xs.length === 0) return;
    pressedRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onActive({ row: rowIndex, index: indexAt(event.clientX, event.currentTarget) });
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (pressedRef.current) onActive({ row: rowIndex, index: indexAt(event.clientX, event.currentTarget) });
  }

  function handlePointerUp() {
    pressedRef.current = false;
  }

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (xs.length === 0) return;
    const last = xs.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = active === null ? last : Math.max(0, active - 1);
    else if (event.key === 'ArrowRight') next = active === null ? last : Math.min(last, active + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Escape') {
      onActive(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    onActive({ row: rowIndex, index: next });
  }

  const counts = statusOrder
    .map((status) => ({ status, count: row.marks.filter((mark) => mark.status === status).length }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${medicationStatusLabels[entry.status].toLowerCase()}`)
    .join(', ');
  const activeX = active === null ? undefined : xs[active];

  return (
    <li className="flex min-w-0 flex-col gap-1">
      <span className="min-w-0 break-words text-subhead text-label">
        {row.label}
        {row.detail !== undefined && <span className="text-label-secondary"> · {row.detail}</span>}
      </span>
      <svg
        width="100%"
        height={rowHeight}
        viewBox={`0 0 ${width} ${rowHeight}`}
        role="group"
        aria-label={`${rowName(row)}, ${counts}. Use the arrow keys to read each check-in.`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        className="block touch-pan-y select-none rounded-control [-webkit-touch-callout:none] [-webkit-user-select:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <line x1={0} x2={plotRight} y1={midY} y2={midY} strokeWidth={1} className="stroke-separator" />
        {activeX !== undefined && <circle cx={activeX} cy={midY} r={8} fill="none" strokeWidth={1.5} className="stroke-label" />}
        {row.marks.map((mark, index) => (
          <StatusMark key={mark.entryId} status={mark.status} x={xs[index] ?? 0} y={midY} />
        ))}
        <rect x={0} y={0} width={width} height={rowHeight} fill="transparent" />
      </svg>
    </li>
  );
}

export function MedicationStrip({ rows, domain }: MedicationStripProps) {
  const [containerRef, width] = useContainerWidth(fallbackWidth);
  const [active, setActive] = useState<ActiveMark | null>(null);
  const activeRow = active === null ? undefined : rows[active.row];
  const activeMark = active === null ? undefined : activeRow?.marks[active.index];

  return (
    <div ref={containerRef} className="flex min-w-0 flex-col gap-2">
      <ul className="flex flex-col gap-3">
        {rows.map((row, rowIndex) => (
          <StripRow
            key={row.medicationId}
            row={row}
            rowIndex={rowIndex}
            width={width}
            domain={domain}
            active={active?.row === rowIndex ? active.index : null}
            onActive={setActive}
          />
        ))}
      </ul>
      <p aria-live="polite" className="min-h-[1.125rem] break-words text-footnote text-label-secondary">
        {activeRow && activeMark ? markDetail(activeRow, activeMark) : 'Tap a mark to see that check-in'}
      </p>
      <ul aria-hidden="true" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-label-secondary">
        {statusOrder.map((status) => (
          <li key={status} className="flex items-center gap-1">
            <svg width={12} height={12} viewBox="0 0 12 12" className="shrink-0">
              <StatusMark status={status} x={6} y={6} />
            </svg>
            {medicationStatusLabels[status]}
          </li>
        ))}
      </ul>
    </div>
  );
}
