import type { ClockDrawingPoint, SpiralTracingRawResult } from '../activity.ts';
import type { MetricId } from '../metrics.ts';
import type { Score } from '../session.ts';

const spiralTurns = 2;
const spiralRadius = 0.45;

const centre = 0.5;
const fullTurn = 2 * Math.PI;
const maxAngle = spiralTurns * fullTurn;
const growth = spiralRadius / maxAngle;
const sampleRate = 60;
const tremorBandHz = { from: 3, to: 12, step: 0.1 };

const onSpiral = (angle: number) => ({
  x: centre + growth * angle * Math.cos(angle),
  y: centre + growth * angle * Math.sin(angle),
});

export const spiralPath = (size: number, steps = 400): string =>
  `M${Array.from({ length: steps + 1 }, (_, index) => {
    const { x, y } = onSpiral((index / steps) * maxAngle);
    return `${(x * size).toFixed(1)} ${(y * size).toFixed(1)}`;
  }).join('L')}`;

const end = onSpiral(maxAngle);

const signedError = ({ x, y }: ClockDrawingPoint): number => {
  const dx = x - centre;
  const dy = y - centre;
  const radius = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) + fullTurn) % fullTurn;
  let best = radius;
  for (let turn = angle; turn <= maxAngle; turn += fullTurn) {
    const error = radius - growth * turn;
    if (Math.abs(error) < Math.abs(best)) best = error;
  }
  const pastEnd = Math.hypot(x - end.x, y - end.y);
  return pastEnd < Math.abs(best) ? pastEnd : best;
};

const resampled = (stroke: ClockDrawingPoint[]): number[] => {
  const first = stroke[0];
  const last = stroke.at(-1);
  if (!first || !last) return [];
  const errors = stroke.map(signedError);
  const samples: number[] = [];
  let index = 0;
  for (let t = first.t; t <= last.t; t += 1000 / sampleRate) {
    while ((stroke[index + 1]?.t ?? Infinity) < t) index += 1;
    const a = stroke[index] ?? first;
    const b = stroke[index + 1] ?? a;
    const share = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    samples.push((errors[index] ?? 0) * (1 - share) + (errors[index + 1] ?? errors[index] ?? 0) * share);
  }
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return samples.map((value) => value - mean);
};

export const tremorFrequency = (strokes: ClockDrawingPoint[][]): number | undefined => {
  const signal = strokes.flatMap(resampled);
  if (signal.length < sampleRate) return undefined;
  const windowed = signal.map((value, n) => value * (0.5 - 0.5 * Math.cos((fullTurn * n) / (signal.length - 1))));
  let peak = { hz: 0, power: 0 };
  for (let hz = tremorBandHz.from; hz <= tremorBandHz.to + 1e-9; hz += tremorBandHz.step) {
    const step = (fullTurn * hz) / sampleRate;
    let re = 0;
    let im = 0;
    windowed.forEach((value, n) => {
      re += value * Math.cos(step * n);
      im += value * Math.sin(step * n);
    });
    const power = re * re + im * im;
    if (power > peak.power) peak = { hz, power };
  }
  return peak.power > 0 ? peak.hz : undefined;
};

export const meanDeviation = (strokes: ClockDrawingPoint[][]): number | undefined => {
  const points = strokes.flat();
  if (points.length === 0) return undefined;
  return points.reduce((sum, point) => sum + Math.abs(signedError(point)), 0) / points.length;
};

export const tracingSpeed = (strokes: ClockDrawingPoint[][]): number | undefined => {
  let length = 0;
  let durationMs = 0;
  for (const stroke of strokes) {
    stroke.slice(1).forEach((point, index) => {
      const previous = stroke[index] ?? point;
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
    });
    durationMs += (stroke.at(-1)?.t ?? 0) - (stroke[0]?.t ?? 0);
  }
  return durationMs > 0 ? length / (durationMs / 1000) : undefined;
};

export const scoreSpiralTracing = ({ hand, sizeMm, strokes }: SpiralTracingRawResult): Score[] => {
  const deviation = meanDeviation(strokes);
  const speed = tracingSpeed(strokes);
  const values: [MetricId, number | undefined][] = [
    ['spiral-tracing.deviation', deviation === undefined ? undefined : deviation * sizeMm],
    ['spiral-tracing.tremor-frequency', tremorFrequency(strokes)],
    ['spiral-tracing.speed', speed === undefined ? undefined : speed * sizeMm],
  ];
  return values.flatMap(([metricId, value]) =>
    value === undefined ? [] : [{ metricId, side: hand, value: Number(value.toFixed(2)), scoredBy: 'code' as const }],
  );
};
