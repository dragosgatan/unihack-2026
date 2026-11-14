import { rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { MetricPoint, ReferenceBand } from '@tempo/shared';

export type Box = { x: number; y: number; width: number; height: number };

export type Trend = {
  points: MetricPoint[];
  currentSessionId: string;
  baseline: number | null;
  referenceBand: ReferenceBand | null;
  from: string;
  to: string;
  format: (value: number) => string;
};

const frame = rgb(0.8, 0.81, 0.84);
const bandFill = rgb(0.86, 0.91, 0.97);
const baselineColor = rgb(0.45, 0.47, 0.52);
const lineColor = rgb(0.0, 0.4, 0.72);
const labelColor = rgb(0.4, 0.42, 0.46);
const labelSize = 7;
const inset = 6;

export const drawTrend = (page: PDFPage, font: PDFFont, box: Box, trend: Trend): void => {
  page.drawRectangle({ ...box, borderColor: frame, borderWidth: 0.5 });
  const label = (text: string, x: number, y: number) => page.drawText(text, { x, y, size: labelSize, font, color: labelColor });

  if (trend.points.length === 0) {
    label('No history in the last 6 months', box.x + inset, box.y + box.height / 2);
    return;
  }

  const values = [
    ...trend.points.map((point) => point.value),
    ...(trend.baseline === null ? [] : [trend.baseline]),
    ...(trend.referenceBand === null ? [] : [trend.referenceBand.low, trend.referenceBand.high]),
  ];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = high === low ? Math.max(Math.abs(high) * 0.1, 1) : (high - low) * 0.12;
  const min = low - padding;
  const max = high + padding;

  const plot = {
    left: box.x + inset,
    right: box.x + box.width - inset,
    bottom: box.y + inset + labelSize + 2,
    top: box.y + box.height - inset,
  };
  const from = Date.parse(trend.from);
  const span = Math.max(Date.parse(trend.to) - from, 1);
  const xOf = (t: string): number => {
    const share = Math.min(Math.max((Date.parse(t) - from) / span, 0), 1);
    return plot.left + share * (plot.right - plot.left);
  };
  const yOf = (value: number): number => plot.bottom + ((value - min) / (max - min)) * (plot.top - plot.bottom);

  if (trend.referenceBand !== null) {
    const bottom = yOf(trend.referenceBand.low);
    page.drawRectangle({
      x: plot.left,
      y: bottom,
      width: plot.right - plot.left,
      height: yOf(trend.referenceBand.high) - bottom,
      color: bandFill,
    });
  }
  if (trend.baseline !== null) {
    const y = yOf(trend.baseline);
    page.drawLine({
      start: { x: plot.left, y },
      end: { x: plot.right, y },
      thickness: 0.7,
      color: baselineColor,
      dashArray: [3, 2],
    });
  }

  const placed = trend.points.map((point) => ({ x: xOf(point.t), y: yOf(point.value), point }));
  placed.slice(1).forEach((end, index) => {
    const start = placed[index];
    if (start) page.drawLine({ start, end, thickness: 1.1, color: lineColor });
  });
  const current = placed.find(({ point }) => point.sessionId === trend.currentSessionId) ?? placed.at(-1);
  for (const { x, y } of placed) page.drawCircle({ x, y, size: 1.4, color: lineColor });
  if (current) page.drawCircle({ x: current.x, y: current.y, size: 3, color: lineColor });

  label(trend.format(max), box.x + inset, box.y + box.height - inset - labelSize);
  label(trend.format(min), box.x + inset, plot.bottom + 1);
  label(trend.from.slice(0, 10), plot.left, box.y + inset - 1);
  const end = trend.to.slice(0, 10);
  label(end, plot.right - font.widthOfTextAtSize(end, labelSize), box.y + inset - 1);
};
