import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { spiralTracingRawResultSchema } from '@tempo/shared';
import { scoreSpiralTracing } from '@tempo/shared/scoring';
import { completedResult, type ActivityProgress } from '../../session/runner.ts';
import { press } from '../check-in-test-helpers.ts';
import { SpiralTracing } from './SpiralTracing.tsx';

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const stroke = (points: [x: number, y: number][]) => {
  const area = screen.getByRole('img', { name: 'Drawing area' });
  const [first, ...rest] = points;
  if (!first) return;
  fireEvent.pointerDown(area, { isPrimary: true, pointerId: 1, clientX: first[0], clientY: first[1] });
  for (const [clientX, clientY] of rest) fireEvent.pointerMove(area, { pointerId: 1, clientX, clientY });
  fireEvent.pointerUp(area, { pointerId: 1 });
};

const setup = () => {
  const onComplete = vi.fn();
  const progress: ActivityProgress[] = [];
  const view = render(
    <SpiralTracing config={{}} language="en" onComplete={onComplete} onProgress={(value) => progress.push(value)} />,
  );
  press('Next');
  press('Left hand');
  stroke([[200, 80], [320, 200], [200, 320]]);
  press('Done');
  press('Start');
  return { onComplete, progress, view };
};

describe('SpiralTracing', () => {
  it('returns the hand, the area size in millimetres and the task trace only', () => {
    const { onComplete } = setup();
    stroke([[200, 200], [210, 200], [210, 210]]);
    press('Done');

    expect(onComplete).toHaveBeenCalledOnce();
    const raw = spiralTracingRawResultSchema.parse(onComplete.mock.calls[0]?.[0]);
    expect(raw).toMatchObject({ hand: 'left', sizeMm: 64 });
    expect(raw.strokes).toHaveLength(1);
    expect(raw.strokes[0]?.[0]).toMatchObject({ x: 0.5, y: 0.5 });
    expect(completedResult('spiral-tracing', raw, new Date())).toBeDefined();
    expect(scoreSpiralTracing(raw).every((score) => score.side === 'left')).toBe(true);
  });

  it('exposes the trace so far when the runner unmounts it mid-task', () => {
    const { onComplete, progress, view } = setup();
    stroke([[200, 200], [220, 200]]);

    expect(progress.map((value) => value.stage)).toEqual(expect.arrayContaining(['practice', 'task']));
    const partial = spiralTracingRawResultSchema.parse(progress.at(-1)?.partialData);
    expect(partial).toMatchObject({ hand: 'left', strokes: [[{ x: 0.5, y: 0.5 }, { x: 0.55, y: 0.5 }]] });
    view.unmount();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
