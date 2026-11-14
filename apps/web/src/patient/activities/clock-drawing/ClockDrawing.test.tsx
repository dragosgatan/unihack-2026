import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clockDrawingRawResultSchema } from '@tempo/shared';
import { clockDrawingFeatures } from '@tempo/shared/scoring';
import { completedResult, type ActivityProgress } from '../../session/runner.ts';
import { press } from '../check-in-test-helpers.ts';
import { ClockDrawing } from './ClockDrawing.tsx';

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const stroke = (points: [x: number, y: number][], pointerId = 1) => {
  const area = screen.getByRole('img', { name: 'Drawing area' });
  const [first, ...rest] = points;
  if (!first) return;
  fireEvent.pointerDown(area, { isPrimary: true, pointerId, clientX: first[0], clientY: first[1] });
  for (const [clientX, clientY] of rest) fireEvent.pointerMove(area, { pointerId, clientX, clientY });
  fireEvent.pointerUp(area, { pointerId });
};

const setup = () => {
  const onComplete = vi.fn();
  const progress: ActivityProgress[] = [];
  const view = render(
    <ClockDrawing config={{}} language="en" onComplete={onComplete} onProgress={(value) => progress.push(value)} />,
  );
  press('Next');
  press('Left hand');
  stroke([[200, 40], [360, 200], [200, 360]]);
  press('Done');
  press('Start');
  return { onComplete, progress, view };
};

describe('ClockDrawing', () => {
  it('returns the hand, target time and strokes drawn in the task, not the practice', () => {
    const { onComplete } = setup();
    expect(screen.getByRole('button', { name: 'Done' })).toHaveProperty('disabled', true);
    stroke([[200, 40], [360, 200], [200, 360], [40, 200], [200, 40]]);
    stroke([[200, 200]]);
    press('Done');

    expect(onComplete).toHaveBeenCalledOnce();
    const raw = clockDrawingRawResultSchema.parse(onComplete.mock.calls[0]?.[0]);
    expect(raw.hand).toBe('left');
    expect(raw.strokes).toHaveLength(2);
    expect(raw.strokes[0]?.[1]).toMatchObject({ x: 0.9, y: 0.5 });
    expect(completedResult('clock-drawing', raw, new Date())).toBeDefined();
    expect(clockDrawingFeatures(raw)?.strokes).toBe(2);
  });

  it('ignores a second finger touching while one is drawing', () => {
    const { onComplete } = setup();
    const area = screen.getByRole('img', { name: 'Drawing area' });
    fireEvent.pointerDown(area, { isPrimary: true, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerDown(area, { isPrimary: false, pointerId: 2, clientX: 400, clientY: 400 });
    fireEvent.pointerMove(area, { pointerId: 2, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(area, { pointerId: 1 });
    press('Done');
    expect(clockDrawingRawResultSchema.parse(onComplete.mock.calls[0]?.[0]).strokes).toEqual([[{ t: expect.any(Number), x: 0, y: 0 }]]);
  });

  it('exposes the strokes so far when the runner unmounts it mid-task', () => {
    const { onComplete, progress, view } = setup();
    stroke([[200, 40], [360, 200]]);

    expect(progress.map((value) => value.stage)).toEqual(expect.arrayContaining(['practice', 'task']));
    const partial = clockDrawingRawResultSchema.parse(progress.at(-1)?.partialData);
    expect(partial).toMatchObject({ hand: 'left', strokes: [[{ x: 0.5, y: 0.1 }, { x: 0.9, y: 0.5 }]] });
    view.unmount();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
