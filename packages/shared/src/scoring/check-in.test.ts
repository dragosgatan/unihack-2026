import { describe, expect, it } from 'vitest';
import type { MedicationStatus } from '../checkin.ts';
import { scoreEpisodesCheckIn, scoreMedicationCheckIn, scorePainCheckIn } from './check-in.ts';
import { scoreResult } from './index.ts';

const medications = (...statuses: MedicationStatus[]) => ({
  item: 'medication' as const,
  medications: statuses.map((status, index) => ({ medicationId: `med-${index}`, name: `Drug ${index}`, status })),
});

describe('scorePainCheckIn', () => {
  it('scores the reported intensity, including zero', () => {
    expect(scorePainCheckIn({ item: 'pain', intensity: 6, location: 'back', type: 'ache' })).toEqual([
      { metricId: 'pain.intensity', value: 6, scoredBy: 'code' },
    ]);
    expect(scorePainCheckIn({ item: 'pain', intensity: 0 })).toEqual([
      { metricId: 'pain.intensity', value: 0, scoredBy: 'code' },
    ]);
  });
});

describe('scoreEpisodesCheckIn', () => {
  it('sums the counts of every episode type', () => {
    const raw = {
      item: 'episodes' as const,
      episodes: [
        { type: 'freezing' as const, count: 3 },
        { type: 'fall' as const, count: 1 },
        { type: 'dizziness' as const, count: 0 },
      ],
    };
    expect(scoreEpisodesCheckIn(raw)).toEqual([{ metricId: 'episodes.count', value: 4, scoredBy: 'code' }]);
  });

  it('scores an answered check-in without episodes as zero', () => {
    expect(scoreEpisodesCheckIn({ item: 'episodes', episodes: [] })).toEqual([
      { metricId: 'episodes.count', value: 0, scoredBy: 'code' },
    ]);
  });
});

describe('scoreMedicationCheckIn', () => {
  it('scores taken out of taken and missed as a percentage', () => {
    expect(scoreMedicationCheckIn(medications('taken', 'missed', 'taken'))).toEqual([
      { metricId: 'medication.adherence', value: 66.7, scoredBy: 'code' },
    ]);
    expect(scoreMedicationCheckIn(medications('taken'))).toEqual([
      { metricId: 'medication.adherence', value: 100, scoredBy: 'code' },
    ]);
    expect(scoreMedicationCheckIn(medications('missed'))).toEqual([
      { metricId: 'medication.adherence', value: 0, scoredBy: 'code' },
    ]);
  });

  it('leaves stopped drugs out', () => {
    expect(scoreMedicationCheckIn(medications('stopped', 'taken', 'missed'))).toEqual([
      { metricId: 'medication.adherence', value: 50, scoredBy: 'code' },
    ]);
  });

  it('gives no score when no drug is left to count', () => {
    expect(scoreMedicationCheckIn(medications())).toEqual([]);
    expect(scoreMedicationCheckIn(medications('stopped', 'stopped'))).toEqual([]);
  });
});

describe('scoreResult', () => {
  it('dispatches the three check-ins', () => {
    expect(scoreResult({ activityId: 'check-in-pain', data: { item: 'pain', intensity: 3 } })).toEqual([
      { metricId: 'pain.intensity', value: 3, scoredBy: 'code' },
    ]);
    expect(scoreResult({ activityId: 'check-in-medication', data: medications('taken', 'missed') })).toEqual([
      { metricId: 'medication.adherence', value: 50, scoredBy: 'code' },
    ]);
    expect(scoreResult({ activityId: 'check-in-episodes', data: { item: 'episodes', episodes: [] } })).toEqual([
      { metricId: 'episodes.count', value: 0, scoredBy: 'code' },
    ]);
  });
});
