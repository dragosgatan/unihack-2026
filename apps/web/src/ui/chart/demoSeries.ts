import type { MetricEvent, MetricPoint, MetricSeries } from '@tempo/shared';

const dayMs = 86_400_000;
const sessionDays = new Set([1, 3, 5]);

function iso(t: number): string {
  return new Date(t).toISOString();
}

export function buildDemoSeries(now: number): MetricSeries {
  const today = new Date(now);
  today.setHours(10, 0, 0, 0);
  const end = today.getTime();
  const start = end - 365 * dayMs;

  const sessions: number[] = [];
  for (let t = start; t <= end; t += dayMs) {
    if (sessionDays.has(new Date(t).getDay())) sessions.push(t);
  }

  const skipIndexes = new Map<number, Pick<Extract<MetricEvent, { type: 'skip' }>, 'label' | 'reason' | 'stage'>>([
    [sessions.length - 5, { label: 'Too tired', reason: 'tired', stage: 'practice' }],
    [sessions.length - 17, { label: 'Pain in the right hand', reason: 'pain', stage: 'task' }],
  ]);

  const points: MetricPoint[] = [];
  const events: MetricEvent[] = [];
  sessions.forEach((t, index) => {
    const skip = skipIndexes.get(index);
    if (skip) {
      events.push({ id: `demo-skip-${index}`, t: iso(t + 5 * 60_000), type: 'skip', sessionId: `demo-session-${index}`, ...skip });
      return;
    }
    const progress = index / sessions.length;
    const wobble = Math.sin(index * 1.7) * 0.18 + Math.sin(index * 0.43) * 0.12;
    points.push({ t: iso(t), value: Math.round((3.6 + progress * 0.9 + wobble) * 100) / 100 });
  });

  events.push(
    { id: 'demo-medication', t: iso(end - 240 * dayMs), type: 'medication-change', label: 'Levodopa dose increased' },
    { id: 'demo-baseline', t: iso(end - 120 * dayMs), type: 'baseline-reset', label: 'Baseline reset after dose change' },
    { id: 'demo-plan', t: iso(end - 20 * dayMs + 2 * 3_600_000), type: 'plan-change', label: 'Plan version 3' },
  );

  return {
    metricId: 'finger-tapping.taps-per-second',
    unit: 'taps/s',
    points,
    baseline: 4.2,
    referenceBand: { low: 3.9, high: 4.5 },
    events,
  };
}
