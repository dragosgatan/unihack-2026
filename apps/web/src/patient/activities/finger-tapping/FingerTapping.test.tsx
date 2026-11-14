import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fingerTappingRawResultSchema } from '@tempo/shared';
import { scoreFingerTapping } from '@tempo/shared/scoring';
import type { ActivityProgress } from '../../session/runner.ts';
import { FingerTapping } from './FingerTapping.tsx';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

let pressedAt = 0;

const press = (name: string) => {
  const click = new MouseEvent('click', { bubbles: true, detail: 0 });
  pressedAt += 1000;
  Object.defineProperty(click, 'timeStamp', { value: pressedAt });
  act(() => {
    screen.getByRole('button', { name }).dispatchEvent(click);
  });
};

const tapCircles = (count: number) => {
  for (let i = 0; i < count; i += 1) {
    fireEvent.pointerDown(screen.getByRole('button', { name: i % 2 === 0 ? 'First circle' : 'Second circle' }));
  }
};

const setup = (sides: ('left' | 'right')[]) => {
  const onComplete = vi.fn();
  const progress: ActivityProgress[] = [];
  const view = render(
    <FingerTapping
      config={{ sides, trialDurationMs: 1000 }}
      language="en"
      onComplete={onComplete}
      onProgress={(value) => progress.push(value)}
    />,
  );
  press('Practise');
  tapCircles(6);
  return { onComplete, progress, view };
};

describe('FingerTapping', () => {
  it('runs one timed trial per configured hand and returns scorable raw data', () => {
    const { onComplete } = setup(['right', 'left']);
    for (let trial = 0; trial < 2; trial += 1) {
      press('Start');
      tapCircles(8);
      act(() => vi.advanceTimersByTime(1000));
    }

    expect(onComplete).toHaveBeenCalledOnce();
    const raw = fingerTappingRawResultSchema.parse(onComplete.mock.calls[0]?.[0]);
    expect(raw.trials.map((trial) => [trial.side, trial.taps.length, trial.taps[1]?.target])).toEqual([
      ['right', 8, 'b'],
      ['left', 8, 'b'],
    ]);
    expect(scoreFingerTapping(raw).length).toBeGreaterThan(0);
  });

  it('works with one hand only', () => {
    const { onComplete } = setup(['left']);
    press('Start');
    tapCircles(4);
    act(() => vi.advanceTimersByTime(1000));
    expect(onComplete.mock.calls[0]?.[0].trials).toHaveLength(1);
  });

  it('exposes the taps so far and stops its timer when unmounted mid-trial', () => {
    const { onComplete, progress, view } = setup(['right']);
    press('Start');
    tapCircles(3);

    expect(progress.at(-1)).toMatchObject({ stage: 'task', partialData: { trials: [{ side: 'right' }] } });
    view.unmount();
    vi.advanceTimersByTime(5000);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
