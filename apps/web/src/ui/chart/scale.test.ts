import { describe, expect, it } from 'vitest';
import { latestTime, linearScale, nearestIndex, niceTicks, splitAtGaps, timeDomain, timeTicks } from './scale.ts';

const dayMs = 86_400_000;
const latest = new Date(2026, 10, 14, 15, 30).getTime();

describe('timeDomain', () => {
  it('ends at the end of the latest day', () => {
    const { end } = timeDomain('W', latest);
    expect(end).toBe(new Date(2026, 10, 15).getTime());
  });

  it('spans one week, one month, six months and one year', () => {
    expect(timeDomain('W', latest).start).toBe(new Date(2026, 10, 8).getTime());
    expect(timeDomain('M', latest).start).toBe(new Date(2026, 9, 15).getTime());
    expect(timeDomain('6M', latest).start).toBe(new Date(2026, 4, 15).getTime());
    expect(timeDomain('Y', latest).start).toBe(new Date(2025, 10, 15).getTime());
  });

  it('falls back to now when there is nothing to plot', () => {
    expect(latestTime([], 42)).toBe(42);
    expect(latestTime([5, 9, 7], 42)).toBe(9);
  });
});

describe('linearScale', () => {
  it('maps the domain onto the range, inverted for y', () => {
    const y = linearScale([0, 10], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(5)).toBe(100);
    expect(y(10)).toBe(0);
  });
});

describe('niceTicks', () => {
  it('covers the extent with round steps', () => {
    expect(niceTicks(3.62, 4.71)).toEqual([3.6, 3.8, 4, 4.2, 4.4, 4.6, 4.8]);
    expect(niceTicks(12, 87)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('pads a flat series', () => {
    const ticks = niceTicks(5, 5);
    expect(ticks[0]).toBeLessThan(5);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(5);
  });
});

describe('nearestIndex', () => {
  const xs = [10, 20, 40, 80];

  it('finds the closest value', () => {
    expect(nearestIndex(xs, 0)).toBe(0);
    expect(nearestIndex(xs, 14)).toBe(0);
    expect(nearestIndex(xs, 16)).toBe(1);
    expect(nearestIndex(xs, 61)).toBe(3);
    expect(nearestIndex(xs, 500)).toBe(3);
  });

  it('returns -1 for an empty list', () => {
    expect(nearestIndex([], 3)).toBe(-1);
  });
});

describe('splitAtGaps', () => {
  const points = [{ t: 1 }, { t: 2 }, { t: 3 }, { t: 4 }];

  it('breaks the line at a skip between two points', () => {
    expect(splitAtGaps(points, [2.5])).toEqual([[{ t: 1 }, { t: 2 }], [{ t: 3 }, { t: 4 }]]);
  });

  it('keeps one segment when the skip is outside the points', () => {
    expect(splitAtGaps(points, [0, 9])).toEqual([points]);
  });
});

describe('timeTicks', () => {
  it('labels each day of the week', () => {
    const ticks = timeTicks('W', timeDomain('W', latest));
    expect(ticks).toHaveLength(7);
    expect(ticks[ticks.length - 1]?.label).toBe('S');
  });

  it('labels Mondays in the month view', () => {
    const ticks = timeTicks('M', timeDomain('M', latest));
    expect(ticks.map((tick) => new Date(tick.t).getDay())).toEqual(ticks.map(() => 1));
    expect(ticks[0]?.label).toBe('19 Oct');
  });

  it('labels months in the 6M and Y views', () => {
    const half = timeTicks('6M', timeDomain('6M', latest)).map((tick) => tick.label);
    expect(half).toHaveLength(6);
    expect(half[0]).toBe('Jun');
    expect(half[5]).toBe('Nov');
    const year = timeTicks('Y', timeDomain('Y', latest));
    expect(year).toHaveLength(12);
    expect(year[0]?.label).toBe('D');
  });

  it('keeps every tick inside the domain', () => {
    const domain = timeDomain('Y', latest);
    for (const tick of timeTicks('Y', domain)) {
      expect(tick.t).toBeGreaterThanOrEqual(domain.start);
      expect(tick.t).toBeLessThan(domain.end + dayMs);
    }
  });
});
