import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { shoulderRaiseRawResultSchema, sitToStandRawResultSchema } from '@tempo/shared';
import type { Landmark } from '@mediapipe/tasks-vision';
import type { ActivityProgress } from '../../session/runner.ts';
import type { PoseTracking } from '../../pose/tracker.ts';
import { ShoulderRaise, SitToStand } from './exercises.tsx';

const tracking = vi.hoisted(() => ({ current: undefined as PoseTracking | undefined }));

vi.mock('../../pose/tracker.ts', () => ({
  startPoseTracking: (options: PoseTracking) => {
    tracking.current = options;
    return Promise.resolve('GPU');
  },
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  tracking.current = undefined;
});

const point = (x: number, y: number, z = 0): Landmark => ({ x, y, z, visibility: 1 });

const pose = ({ rightArm = 5, thigh = 5 }: { rightArm?: number; thigh?: number }): Landmark[] => {
  const landmarks: Landmark[] = [];
  const arm = (rightArm * Math.PI) / 180;
  const legs = (thigh * Math.PI) / 180;
  landmarks[11] = point(0.18, -0.5);
  landmarks[12] = point(-0.18, -0.5);
  landmarks[13] = point(0.18, -0.22);
  landmarks[14] = point(-0.18 - 0.28 * Math.sin(arm), -0.5 + 0.28 * Math.cos(arm));
  landmarks[23] = point(0.1, 0);
  landmarks[24] = point(-0.1, 0);
  landmarks[25] = point(0.1, 0.45 * Math.sin(legs), -0.45 * Math.cos(legs));
  landmarks[26] = point(-0.1, 0.45 * Math.sin(legs), -0.45 * Math.cos(legs));
  return landmarks;
};

const feed = (...poses: Landmark[][]) => {
  for (const world of poses) act(() => tracking.current?.onFrame(undefined, world));
};

const raise = (peak: number) => feed(pose({}), pose({ rightArm: peak / 2 }), pose({ rightArm: peak }), pose({}));
const stand = () => feed(pose({}), pose({ thigh: 85 }), pose({}));

let pressedAt = 0;

const press = (name: string) => {
  const click = new MouseEvent('click', { bubbles: true, detail: 0 });
  pressedAt += 1000;
  Object.defineProperty(click, 'timeStamp', { value: pressedAt });
  act(() => {
    screen.getByRole('button', { name }).dispatchEvent(click);
  });
};

const start = async (element: ReactElement) => {
  const view = render(element);
  press('Start');
  await act(async () => {});
  return view;
};

describe('Exercise', () => {
  it('counts shoulder raises after one practice rep and returns angles per rep', async () => {
    const onComplete = vi.fn();
    const progress: ActivityProgress[] = [];
    await start(
      <ShoulderRaise
        config={{ side: 'right', targetRepetitions: 2 }}
        language="en"
        onComplete={onComplete}
        onProgress={(value) => progress.push(value)}
      />,
    );

    expect(screen.getByText(/Practice/)).toBeTruthy();
    raise(90);
    expect(screen.getByText(/Now the real one/)).toBeTruthy();
    raise(120);
    expect(screen.getByText('1 of 2')).toBeTruthy();
    raise(140);
    act(() => vi.advanceTimersByTime(2500));

    expect(onComplete).toHaveBeenCalledOnce();
    const raw = shoulderRaiseRawResultSchema.parse(onComplete.mock.calls[0]?.[0]);
    expect(raw.trials.map((trial) => [trial.side, trial.reps.map((rep) => Math.round(Math.max(...rep.angles)))])).toEqual([
      ['right', [120, 140]],
    ]);
    expect(progress.map((value) => value.stage)).toContain('practice');
  });

  it('stops the camera and keeps the reps done so far when unmounted mid-task', async () => {
    const onComplete = vi.fn();
    const progress: ActivityProgress[] = [];
    const view = await start(
      <ShoulderRaise
        config={{ side: 'left', targetRepetitions: 5 }}
        language="en"
        onComplete={onComplete}
        onProgress={(value) => progress.push(value)}
      />,
    );
    const signal = tracking.current?.signal;
    feed(pose({}));
    view.unmount();

    expect(signal?.aborted).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    expect(progress.at(-1)?.stage).toBe('practice');
  });

  it('runs sit to stand for 30 seconds and counts the stands without showing the count', async () => {
    const onComplete = vi.fn();
    await start(<SitToStand config={{}} language="en" onComplete={onComplete} onProgress={() => undefined} />);
    stand();
    stand();
    stand();
    expect(screen.queryByText('2')).toBeNull();
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText(/Stop/)).toBeTruthy();
    act(() => vi.advanceTimersByTime(2500));

    const raw = sitToStandRawResultSchema.parse(onComplete.mock.calls[0]?.[0]);
    expect(raw).toMatchObject({ durationMs: 30_000 });
    expect(raw.reps).toHaveLength(2);
  });
});
