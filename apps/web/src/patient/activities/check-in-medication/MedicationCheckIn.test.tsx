import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { press } from '../check-in-test-helpers.ts';
import { completedResult } from '../../session/runner.ts';
import { MedicationCheckIn } from './MedicationCheckIn.tsx';

afterEach(cleanup);

const config = {
  medications: [
    { medicationId: 'med-2', name: 'Levodopa' },
    { medicationId: 'med-3', name: 'Rasagiline' },
  ],
};

describe('MedicationCheckIn', () => {
  it('asks about each prescribed drug and returns a valid result', () => {
    const onComplete = vi.fn();
    render(<MedicationCheckIn config={config} language="en" onComplete={onComplete} />);
    press('I missed some');
    press('Yes');
    press('Yes, as planned');
    press('No');
    const data = onComplete.mock.calls[0]?.[0];
    expect(data).toEqual({
      item: 'medication',
      medications: [
        { medicationId: 'med-2', name: 'Levodopa', status: 'missed', sideEffects: 'Noticed side effects' },
        { medicationId: 'med-3', name: 'Rasagiline', status: 'taken' },
      ],
    });
    expect(completedResult('check-in-medication', data, new Date())).toBeDefined();
  });

  it('completes with an empty list when the plan names no drugs', () => {
    const onComplete = vi.fn();
    render(<MedicationCheckIn config={{}} language="en" onComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledWith({ item: 'medication', medications: [] });
  });
});
