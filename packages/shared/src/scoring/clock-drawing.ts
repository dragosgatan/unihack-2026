import type { ClockDrawingPoint, ClockDrawingRawResult } from '../activity.ts';

export type ClockDrawingFeatures = { strokes: number; planningMs: number; drawingMs: number };

export const clockDrawingFeatures = ({ strokes }: ClockDrawingRawResult): ClockDrawingFeatures | undefined => {
  const times = strokes.flat().map((point) => point.t);
  if (times.length === 0) return undefined;
  const first = times.reduce((a, b) => Math.min(a, b));
  const last = times.reduce((a, b) => Math.max(a, b));
  return { strokes: strokes.length, planningMs: first, drawingMs: last - first };
};

const at = ({ x, y }: ClockDrawingPoint, size: number) => `${Math.round(x * size)} ${Math.round(y * size)}`;

export const clockStrokesPath = (strokes: ClockDrawingPoint[][], size: number): string =>
  strokes
    .map((stroke) => {
      // A lone moveto draws nothing, so a single touch is repeated to leave a dot under the round line cap.
      const points = stroke.length === 1 ? [...stroke, ...stroke] : stroke;
      return `M${points.map((point) => at(point, size)).join('L')}`;
    })
    .join('');

export const clockDrawingSvg = ({ strokes }: ClockDrawingRawResult, size = 512): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
  `<rect width="${size}" height="${size}" fill="#fff"/>` +
  `<path d="${clockStrokesPath(strokes, size)}" fill="none" stroke="#000" stroke-width="${size / 100}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `</svg>`;
