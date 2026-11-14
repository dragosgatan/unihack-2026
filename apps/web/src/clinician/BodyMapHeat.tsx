import type { ReactNode } from 'react';
import { bodyRegionLabels, type BodyRegion } from '@tempo/shared';
import { heatFillClasses, heatLevel, regionCountText, regionTotal, type RegionCount } from './checkIn.ts';
import { HeatLegend } from './HeatLegend.tsx';

export interface BodyMapHeatProps {
  counts: readonly RegionCount[];
  caption: string;
  emptyText: string;
}

const regionShapes: Record<BodyRegion, ReactNode> = {
  'head-neck': (
    <>
      <circle cx={100} cy={24} r={16} />
      <rect x={93} y={38} width={14} height={12} rx={3} />
    </>
  ),
  'right-shoulder': <circle cx={68} cy={62} r={11} />,
  'left-shoulder': <circle cx={132} cy={62} r={11} />,
  chest: <rect x={80} y={52} width={40} height={66} rx={10} />,
  'right-arm': <rect x={53} y={77} width={14} height={84} rx={7} />,
  'left-arm': <rect x={133} y={77} width={14} height={84} rx={7} />,
  'right-hip': <rect x={80} y={121} width={19} height={26} rx={6} />,
  'left-hip': <rect x={101} y={121} width={19} height={26} rx={6} />,
  'right-knee': <circle cx={89} cy={186} r={9} />,
  'left-knee': <circle cx={111} cy={186} r={9} />,
  'right-foot': <ellipse cx={87} cy={246} rx={11} ry={6} />,
  'left-foot': <ellipse cx={113} cy={246} rx={11} ry={6} />,
  back: <rect x={190} y={52} width={40} height={66} rx={10} />,
};

const bodyRegionOrder = Object.keys(regionShapes) as BodyRegion[];

export function BodyMapHeat({ counts, caption, emptyText }: BodyMapHeatProps) {
  const countOf = new Map(counts.map((entry) => [entry.region, regionTotal(entry)]));
  const labels = bodyRegionLabels.en;
  const summary =
    counts.length === 0
      ? `Body map, ${emptyText}`
      : `Body map, ${counts.map((entry) => `${labels[entry.region]} ${regionCountText(entry)}`).join(', ')}`;

  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <figcaption className="text-footnote text-label-secondary">{caption}</figcaption>
      <svg viewBox="0 0 240 262" role="img" aria-label={summary} className="mx-auto block h-auto w-full max-w-60">
        <g className="fill-none stroke-separator" strokeWidth={1}>
          <rect x={81} y={150} width={16} height={26} rx={6} />
          <rect x={103} y={150} width={16} height={26} rx={6} />
          <rect x={82} y={197} width={14} height={42} rx={6} />
          <rect x={104} y={197} width={14} height={42} rx={6} />
          <rect x={56} y={163} width={8} height={12} rx={4} />
          <rect x={136} y={163} width={8} height={12} rx={4} />
        </g>
        {bodyRegionOrder.map((region) => (
          <g key={region} strokeWidth={2} className={`stroke-surface ${heatFillClasses[heatLevel(countOf.get(region) ?? 0)]}`}>
            {regionShapes[region]}
          </g>
        ))}
        <g className="fill-label-secondary text-caption" textAnchor="middle">
          <text x={62} y={16}>
            Right
          </text>
          <text x={138} y={16}>
            Left
          </text>
          <text x={210} y={134}>
            Back
          </text>
        </g>
      </svg>
      <p className="text-center text-caption text-label-secondary">Front view: the patient’s left is on your right.</p>
      {counts.length === 0 ? (
        <p className="text-subhead text-label-secondary">{emptyText}</p>
      ) : (
        <>
          <HeatLegend />
          <ul className="flex flex-col">
            {counts.map((entry) => (
              <li key={entry.region} className="flex min-h-11 items-center justify-between gap-3 border-b border-separator py-2 last:border-b-0">
                <span className="min-w-0 break-words text-body">{labels[entry.region]}</span>
                <span className="text-right text-subhead tabular-nums text-label-secondary">{regionCountText(entry)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}
