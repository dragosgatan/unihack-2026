import { describe, expect, it } from 'vitest';
import { jointAngle } from './angle.ts';

describe('jointAngle', () => {
  it('is 180 for a straight line', () => {
    expect(jointAngle({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeCloseTo(180);
  });

  it('is 90 for a right angle', () => {
    expect(jointAngle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90);
  });

  it('is 0 when both arms point the same way', () => {
    expect(jointAngle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 2 })).toBeCloseTo(0);
  });

  it('does not depend on the side the angle opens to', () => {
    expect(jointAngle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(90);
  });

  it('returns a number, not NaN, for zero-length input', () => {
    expect(jointAngle({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
    expect(jointAngle({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 3, y: 2 })).toBe(0);
  });
});
