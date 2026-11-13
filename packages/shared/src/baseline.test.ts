import { describe, expect, it } from 'vitest';
import { initialBaseline, median, ownRange } from './baseline.ts';

const points = (...values: number[]) =>
  values.map((value, index) => ({ t: `2026-10-0${index + 1}T10:00:00.000Z`, value }));

describe('median', () => {
  it('takes the middle value of an odd count and the mean of the middle two of an even count', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('initialBaseline', () => {
  it('is the median of the first three points', () => {
    expect(initialBaseline(points(4.2, 3.8, 4.0, 9))).toBe(4);
  });

  it('is null before three points exist', () => {
    expect(initialBaseline(points(4.2, 3.8))).toBeNull();
  });
});

describe('ownRange', () => {
  it('spans the reliable-change margin around the baseline and never goes below zero', () => {
    expect(ownRange('finger-tapping.taps-per-second', 4.1)).toEqual({ low: 3.7, high: 4.5 });
    expect(ownRange('episodes.count', 0)).toEqual({ low: 0, high: 1 });
  });
});
