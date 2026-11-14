import type { Episode, EpisodeType, MedicationStatus, PainType } from '@tempo/shared';

export const episodeTypeLabels: Record<EpisodeType, { one: string; many: string }> = {
  fall: { one: 'fall', many: 'falls' },
  dizziness: { one: 'dizziness', many: 'dizziness' },
  seizure: { one: 'seizure', many: 'seizures' },
  freezing: { one: 'freezing', many: 'freezing' },
  confusion: { one: 'confusion', many: 'confusion' },
  spasm: { one: 'spasm', many: 'spasms' },
};

export function episodeTypeLabel(type: EpisodeType, count: number): string {
  const label = episodeTypeLabels[type];
  return count === 1 ? label.one : label.many;
}

export const episodeSourceLabels: Record<Episode['source'], string> = {
  'check-in': 'check-in',
  home: 'home',
  staff: 'staff',
};

export const painTypeLabels: Record<PainType, string> = {
  ache: 'Ache',
  sharp: 'Sharp',
  burning: 'Burning',
  'phantom-limb': 'Phantom limb',
};

export const medicationStatusLabels: Record<MedicationStatus, string> = {
  taken: 'Taken',
  missed: 'Missed',
  stopped: 'Stopped',
};
