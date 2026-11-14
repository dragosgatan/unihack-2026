import type { ReactNode } from 'react';
import { heatFillClasses, heatLevelLabels } from './checkIn.ts';

const levels = [1, 2, 3, 4] as const;

export function HeatLegend({ children }: { children?: ReactNode }) {
  return (
    <ul aria-hidden="true" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption tabular-nums text-label-secondary">
      {levels.map((level) => (
        <li key={level} className="flex items-center gap-1">
          <svg width={12} height={12} viewBox="0 0 12 12" className="shrink-0">
            <rect width={12} height={12} rx={3} className={heatFillClasses[level]} />
          </svg>
          {heatLevelLabels[level]}
        </li>
      ))}
      {children}
    </ul>
  );
}
