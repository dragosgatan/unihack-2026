import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { press } from '../check-in-test-helpers.ts';
import { completedResult } from '../../session/runner.ts';
import { EpisodesCheckIn } from './EpisodesCheckIn.tsx';

afterEach(cleanup);

const setup = () => {
  const onComplete = vi.fn();
  render(<EpisodesCheckIn config={{}} language="en" onComplete={onComplete} />);
  return onComplete;
};

describe('EpisodesCheckIn', () => {
  it('records a count per episode type and returns a valid result', () => {
    const onComplete = setup();
    press('A fall');
    press('2');
    expect(screen.queryByRole('button', { name: 'A fall' })).toBeNull();
    press('Dizziness');
    press('10 or more');
    press("No, that's all");
    const data = onComplete.mock.calls[0]?.[0];
    expect(data).toEqual({
      item: 'episodes',
      episodes: [
        { type: 'fall', count: 2 },
        { type: 'dizziness', count: 10 },
      ],
    });
    expect(completedResult('check-in-episodes', data, new Date())).toBeDefined();
  });

  it('takes one tap when nothing happened', () => {
    const onComplete = setup();
    press('No, none of these');
    expect(onComplete).toHaveBeenCalledWith({ item: 'episodes', episodes: [] });
  });
});
