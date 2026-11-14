import { describe, expect, it } from 'vitest';
import type { MedicalRecord, MetricSeries, PatientMetric } from '@tempo/shared';
import { medicalRecord } from '../../../../packages/shared/src/test-fixtures.ts';
import {
  affectedSide,
  deriveSymmetrySeries,
  latestPoint,
  otherSide,
  pairByTime,
  symmetryApplies,
  symmetryIndex,
  symmetrySource,
  unionByTime,
  weeksBetween,
} from './symmetry.ts';

const affected: MetricSeries = {
  metricId: 'single-leg-squat.depth',
  unit: '%',
  points: [
    { t: '2026-11-01T15:00:00.000Z', value: 40 },
    { t: '2026-11-05T15:00:00.000Z', value: 51 },
    { t: '2026-11-09T15:00:00.000Z', value: 55 },
  ],
  baseline: 45,
  referenceBand: { low: 40, high: 50 },
  events: [{ id: 'evt-skip', t: '2026-11-07T15:00:00.000Z', type: 'skip', label: 'It hurts', sessionId: 'sess-9', reason: 'pain', stage: 'task' }],
};

const other: MetricSeries = {
  ...affected,
  points: [
    { t: '2026-11-09T15:00:00.000Z', value: 60 },
    { t: '2026-11-01T15:00:00.000Z', value: 62 },
    { t: '2026-11-03T15:00:00.000Z', value: 61 },
  ],
  events: [],
};

const noLimbs: MedicalRecord = { ...medicalRecord, affectedLimbs: [] };

function metric(metricId: PatientMetric['metricId'], lateral: boolean): PatientMetric {
  return { metricId, unit: '%', lateral };
}

describe('symmetry helpers', () => {
  it('pairs values from the same session, oldest first', () => {
    expect(pairByTime(affected.points, other.points)).toEqual([
      { t: '2026-11-01T15:00:00.000Z', first: 40, second: 62 },
      { t: '2026-11-09T15:00:00.000Z', first: 55, second: 60 },
    ]);
  });

  it('keeps every session in the union with a gap for the missing side', () => {
    expect(unionByTime(affected.points, other.points).map((row) => [row.first, row.second])).toEqual([
      [40, 62],
      [null, 61],
      [51, null],
      [55, 60],
    ]);
  });

  it('gives the affected side as a percentage of the other, to one decimal', () => {
    expect(symmetryIndex(52, 61)).toBe(85.2);
    expect(symmetryIndex(60, 60)).toBe(100);
    expect(symmetryIndex(5, 0)).toBeNull();
  });

  it('derives a symmetry series from paired sessions with no baseline or band', () => {
    const derived = deriveSymmetrySeries(affected, other);
    expect(derived.points).toEqual([
      { t: '2026-11-01T15:00:00.000Z', value: 64.5 },
      { t: '2026-11-09T15:00:00.000Z', value: 91.7 },
    ]);
    expect(derived.unit).toBe('%');
    expect(derived.baseline).toBeNull();
    expect(derived.referenceBand).toBeNull();
    expect(derived.events).toEqual(affected.events);
  });

  it('counts whole weeks between a date and now', () => {
    expect(weeksBetween('2026-08-08', new Date('2026-11-14T10:00:00.000Z'))).toBe(14);
    expect(weeksBetween('2026-11-10', new Date('2026-11-14T10:00:00.000Z'))).toBe(0);
    expect(weeksBetween('2026-12-01', new Date('2026-11-14T10:00:00.000Z'))).toBe(0);
  });

  it('finds the latest point regardless of order', () => {
    expect(latestPoint(other.points)?.value).toBe(60);
    expect(latestPoint([])).toBeUndefined();
  });

  it('takes the affected side from the injury, then the affected limbs, else none', () => {
    const injured: MedicalRecord = { ...noLimbs, injury: { structure: 'Anterior cruciate ligament', side: 'left', dateOfInjury: '2026-07-04', phaseHistory: [] } };
    expect(affectedSide(injured)).toBe('left');
    expect(affectedSide(medicalRecord)).toBe('right');
    expect(affectedSide(noLimbs)).toBeNull();
    expect(otherSide('left')).toBe('right');
  });

  it('prefers the server symmetry metric, else the first lateral metric where higher is better', () => {
    expect(symmetrySource([metric('single-leg-squat.knee-valgus', true), metric('single-leg-squat.symmetry', false)])).toEqual({ kind: 'server' });
    expect(symmetrySource([metric('single-leg-squat.knee-valgus', true), metric('shoulder-raise.peak-angle', true)])).toEqual({
      kind: 'derived',
      metricId: 'shoulder-raise.peak-angle',
    });
    expect(symmetrySource([metric('single-leg-squat.knee-valgus', true)])).toBeNull();
  });

  it('applies only with an affected side and a lateral metric', () => {
    expect(symmetryApplies(medicalRecord, [metric('finger-tapping.taps-per-second', true)])).toBe(true);
    expect(symmetryApplies(medicalRecord, [metric('pain.intensity', false)])).toBe(false);
    expect(symmetryApplies(noLimbs, [metric('finger-tapping.taps-per-second', true)])).toBe(false);
  });
});
