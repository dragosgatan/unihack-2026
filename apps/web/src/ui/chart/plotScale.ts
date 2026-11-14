import { linearScale, type TimeDomain } from './scale.ts';

export const yLabelGutter = 40;
export const edgeInset = 6;

export interface PlotXScale {
  x: (t: number) => number;
  plotRight: number;
}

export function plotXScale(width: number, domain: TimeDomain): PlotXScale {
  const plotRight = width - yLabelGutter;
  return { x: linearScale([domain.start, domain.end], [edgeInset, plotRight - edgeInset]), plotRight };
}
