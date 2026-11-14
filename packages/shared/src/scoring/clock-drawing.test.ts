import { describe, expect, it } from 'vitest';
import { rawResultSchema, type ClockDrawingRawResult } from '../activity.ts';
import { clockDrawingFeatures, clockDrawingSvg, clockStrokesPath } from './clock-drawing.ts';
import { scoreResult } from './index.ts';

const raw: ClockDrawingRawResult = {
  hand: 'left',
  targetTime: '11:10',
  strokes: [
    [
      { t: 2400, x: 0.5, y: 0.1 },
      { t: 2500, x: 0.9, y: 0.5 },
      { t: 2650, x: 0.5, y: 0.9 },
    ],
    [{ t: 4000, x: 0.5, y: 0.5 }],
  ],
};

describe('clockDrawingFeatures', () => {
  it('counts strokes and splits the time before the first touch from the time spent drawing', () => {
    expect(clockDrawingFeatures(raw)).toEqual({ strokes: 2, planningMs: 2400, drawingMs: 1600 });
  });

  it('has nothing to report for a blank drawing', () => {
    expect(clockDrawingFeatures({ ...raw, strokes: [] })).toBeUndefined();
  });
});

describe('clockStrokesPath', () => {
  it('scales each stroke to the size and leaves a dot for a single touch', () => {
    expect(clockStrokesPath(raw.strokes, 100)).toBe('M50 10L90 50L50 90M50 50L50 50');
  });
});

describe('clockDrawingSvg', () => {
  it('draws black strokes on a white square for the vision model', () => {
    const svg = clockDrawingSvg(raw, 200);
    expect(svg).toContain('width="200" height="200"');
    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain('d="M100 20L180 100L100 180M100 100L100 100"');
  });
});

describe('clock drawing raw result', () => {
  it('is accepted as a raw result and left to the AI step, never scored in code', () => {
    const parsed = rawResultSchema.parse({ activityId: 'clock-drawing', data: raw });
    expect(scoreResult(parsed)).toEqual([]);
  });

  it('rejects points outside the drawing area and malformed target times', () => {
    const outside = { ...raw, strokes: [[{ t: 0, x: 1.2, y: 0.5 }]] };
    expect(rawResultSchema.safeParse({ activityId: 'clock-drawing', data: outside }).success).toBe(false);
    expect(rawResultSchema.safeParse({ activityId: 'clock-drawing', data: { ...raw, targetTime: 'ten past eleven' } }).success).toBe(false);
  });
});
