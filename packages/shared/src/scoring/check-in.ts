import type { EpisodesCheckIn, MedicationCheckIn, PainCheckIn } from '../checkin.ts';
import type { Score } from '../session.ts';

export const scorePainCheckIn = (raw: PainCheckIn): Score[] => [
  { metricId: 'pain.intensity', value: raw.intensity, scoredBy: 'code' },
];

export const scoreEpisodesCheckIn = (raw: EpisodesCheckIn): Score[] => [
  { metricId: 'episodes.count', value: raw.episodes.reduce((sum, episode) => sum + episode.count, 0), scoredBy: 'code' },
];

export const scoreMedicationCheckIn = (raw: MedicationCheckIn): Score[] => {
  const counted = raw.medications.filter((medication) => medication.status !== 'stopped');
  if (counted.length === 0) return [];
  const taken = counted.filter((medication) => medication.status === 'taken').length;
  return [{ metricId: 'medication.adherence', value: Number(((taken / counted.length) * 100).toFixed(1)), scoredBy: 'code' }];
};
