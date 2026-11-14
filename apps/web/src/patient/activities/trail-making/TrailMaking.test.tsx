import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { trailMakingRawResultSchema } from '@tempo/shared';
import { scoreTrailMaking } from '@tempo/shared/scoring';
import { completedResult, type ActivityProgress } from '../../session/runner.ts';
import { press } from '../check-in-test-helpers.ts';
import { trailLayout } from './layout.ts';
import { TrailMakingA, TrailMakingB } from './TrailMaking.tsx';

afterEach(cleanup);

const tapCircles = (labels: string[]) => {
  for (const label of labels) fireEvent.pointerDown(screen.getByRole('button', { name: label }), { isPrimary: true });
};

const setup = (Module: typeof TrailMakingA, practice: string[]) => {
  const onComplete = vi.fn();
  const progress: ActivityProgress[] = [];
  const view = render(
    <Module config={{}} language="en" onComplete={onComplete} onProgress={(value) => progress.push(value)} />,
  );
  press('Next');
  press('Left hand');
  tapCircles(practice);
  press('Start');
  return { onComplete, progress, view };
};

describe('TrailMaking', () => {
  it('runs part A after a practice trail and returns the hand, layout and taps', () => {
    const { onComplete } = setup(TrailMakingA, ['1', '2', '3', '4']);
    tapCircles(['1', '3', '3', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);

    expect(onComplete).toHaveBeenCalledOnce();
    const raw = trailMakingRawResultSchema.parse(onComplete.mock.calls[0]?.[0]);
    expect(raw.hand).toBe('left');
    expect(raw.targets.map((target) => target.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
    expect(raw.taps.map((tap) => tap.target).slice(0, 4)).toEqual([0, 2, 2, 1]);
    expect(completedResult('trail-making-a', raw, new Date())).toBeDefined();
    expect(scoreTrailMaking('a', raw)).toContainEqual({ metricId: 'trail-making-a.errors', value: 1, scoredBy: 'code' });
  });

  it('alternates numbers and letters in part B', () => {
    const labels = ['1', 'A', '2', 'B', '3', 'C', '4', 'D', '5', 'E', '6', 'F'];
    const { onComplete } = setup(TrailMakingB, ['1', 'A', '2', 'B']);
    tapCircles(labels);
    const raw = trailMakingRawResultSchema.parse(onComplete.mock.calls[0]?.[0]);
    expect(raw.targets.map((target) => target.label)).toEqual(labels);
    expect(scoreTrailMaking('b', raw)).toHaveLength(2);
  });

  it('exposes the hand and taps so far when the runner unmounts it mid-task', () => {
    const { onComplete, progress, view } = setup(TrailMakingA, ['1', '2', '3', '4']);
    tapCircles(['1', '2']);

    expect(progress.map((value) => value.stage)).toContain('practice');
    const partial = trailMakingRawResultSchema.parse(progress.at(-1)?.partialData);
    expect(partial).toMatchObject({ hand: 'left', taps: [{ target: 0 }, { target: 1 }] });
    view.unmount();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('trailLayout', () => {
  it('places every circle inside the area, one per grid cell', () => {
    const targets = trailLayout(Array.from({ length: 12 }, (_, index) => String(index + 1)));
    const cells = targets.map((target) => `${Math.floor(target.x * 3)},${Math.floor(target.y * 4)}`);
    expect(new Set(cells).size).toBe(12);
    expect(targets.every((target) => target.x > 0 && target.x < 1 && target.y > 0 && target.y < 1)).toBe(true);
  });
});
