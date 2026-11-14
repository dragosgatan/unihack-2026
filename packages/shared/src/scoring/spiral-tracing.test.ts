import { describe, expect, it } from 'vitest';
import { rawResultSchema, type ClockDrawingPoint, type SpiralTracingRawResult } from '../activity.ts';
import { scoreResult } from './index.ts';
import { meanDeviation, scoreSpiralTracing, spiralPath, tracingSpeed, tremorFrequency } from './spiral-tracing.ts';

const maxAngle = 2 * 2 * Math.PI;
const growth = 0.45 / maxAngle;

const trace = ({ seconds = 8, tremorHz = 0, amplitude = 0 } = {}): ClockDrawingPoint[] =>
  Array.from({ length: Math.round(seconds * 60) }, (_, index) => {
    const t = index * 16.7 + (index % 3);
    const angle = (t / (seconds * 1000)) * maxAngle;
    const radius = growth * angle + amplitude * Math.sin((2 * Math.PI * tremorHz * t) / 1000);
    return {
      t: Math.round(t),
      x: Number((0.5 + radius * Math.cos(angle)).toFixed(3)),
      y: Number((0.5 + radius * Math.sin(angle)).toFixed(3)),
    };
  });

describe('spiral tracing scoring', () => {
  it('finds almost no deviation on a trace that follows the spiral', () => {
    expect(meanDeviation([trace()])).toBeLessThan(0.001);
  });

  it('measures the deviation and dominant frequency of a 5 Hz tremor', () => {
    const strokes = [trace({ tremorHz: 5, amplitude: 0.01 })];
    expect(meanDeviation(strokes)).toBeCloseTo((2 * 0.01) / Math.PI, 3);
    expect(tremorFrequency(strokes)).toBeCloseTo(5, 0);
    expect(tremorFrequency([trace({ tremorHz: 8, amplitude: 0.01 })])).toBeCloseTo(8, 0);
  });

  it('measures speed over time spent touching, not the pause between strokes', () => {
    const strokes = [
      [{ t: 0, x: 0.1, y: 0.5 }, { t: 1000, x: 0.35, y: 0.5 }],
      [{ t: 5000, x: 0.35, y: 0.5 }, { t: 6000, x: 0.6, y: 0.5 }],
    ];
    expect(tracingSpeed(strokes)).toBeCloseTo(0.25);
  });

  it('scores in millimetres for the hand used and skips what it cannot estimate', () => {
    const raw: SpiralTracingRawResult = { hand: 'left', sizeMm: 50, strokes: [trace({ tremorHz: 5, amplitude: 0.01 })] };
    const scores = scoreSpiralTracing(raw);
    expect(scores.map((score) => score.metricId)).toEqual([
      'spiral-tracing.deviation',
      'spiral-tracing.tremor-frequency',
      'spiral-tracing.speed',
    ]);
    expect(scores.every((score) => score.side === 'left' && score.scoredBy === 'code')).toBe(true);
    expect(scores[0]?.value).toBeCloseTo(0.32, 1);

    const tap = scoreSpiralTracing({ hand: 'right', sizeMm: 50, strokes: [[{ t: 0, x: 0.5, y: 0.5 }]] });
    expect(tap).toEqual([{ metricId: 'spiral-tracing.deviation', side: 'right', value: 0, scoredBy: 'code' }]);
    expect(scoreSpiralTracing({ hand: 'right', sizeMm: 50, strokes: [] })).toEqual([]);
  });

  it('is scored through scoreResult', () => {
    const raw = rawResultSchema.parse({ activityId: 'spiral-tracing', data: { hand: 'right', sizeMm: 50, strokes: [trace()] } });
    expect(scoreResult(raw)).toHaveLength(3);
  });

  it('draws the guide from the centre outwards', () => {
    expect(spiralPath(1000)).toMatch(/^M500\.0 500\.0L/);
  });
});
