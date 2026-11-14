import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { press } from '../check-in-test-helpers.ts';
import { completedResult } from '../../session/runner.ts';
import { PainCheckIn } from './PainCheckIn.tsx';

afterEach(cleanup);

const setup = () => {
  const onComplete = vi.fn();
  render(<PainCheckIn config={{}} language="en" onComplete={onComplete} />);
  return onComplete;
};

describe('PainCheckIn', () => {
  it('asks intensity, location and type and returns a valid result', () => {
    const onComplete = setup();
    press(/Quite a lot/);
    press('Back');
    press('Burning');
    const data = onComplete.mock.calls[0]?.[0];
    expect(data).toEqual({ item: 'pain', intensity: 6, location: 'back', type: 'burning' });
    expect(completedResult('check-in-pain', data, new Date())).toBeDefined();
  });

  it('stops after the first question when there is no pain', () => {
    const onComplete = setup();
    press(/No pain/);
    expect(onComplete).toHaveBeenCalledWith({ item: 'pain', intensity: 0 });
  });

  it('keeps the answer when the patient is not sure where or how it hurts', () => {
    const onComplete = setup();
    press(/A little/);
    press('Not sure');
    press('Not sure');
    const data = onComplete.mock.calls[0]?.[0];
    expect(data).toEqual({ item: 'pain', intensity: 2 });
    expect(completedResult('check-in-pain', data, new Date())).toBeDefined();
  });
});
