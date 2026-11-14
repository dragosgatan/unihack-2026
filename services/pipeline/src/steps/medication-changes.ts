import type { Flag, Medication, ReliableChangeFlag } from '@tempo/shared';

export const medicationWindowDays = 56;

const dayMs = 86_400_000;

export type MedicationChangeKind = 'started' | 'stopped' | 'dose-changed';

export type MedicationChange = { medication: Medication; kind: MedicationChangeKind; date: string };

export type SuggestionCandidate = { flag: ReliableChangeFlag; change: MedicationChange };

const sameDrug = (a: Medication, b: Medication): boolean =>
  (a.rxnormId !== undefined && a.rxnormId === b.rxnormId) || a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

export const medicationChangesBefore = (medications: Medication[], at: string): MedicationChange[] => {
  const to = at.slice(0, 10);
  const from = new Date(Date.parse(at) - medicationWindowDays * dayMs).toISOString().slice(0, 10);
  const inWindow = (date: string | undefined): date is string => date !== undefined && date >= from && date <= to;

  const stops = medications.filter((medication) => inWindow(medication.stopDate));
  const paired = new Set<Medication>();
  const changes: MedicationChange[] = medications
    .filter((medication) => inWindow(medication.startDate))
    .map((medication): MedicationChange => {
      const replaced = stops.find(
        (stop) =>
          stop !== medication && !paired.has(stop) && stop.stopDate === medication.startDate && sameDrug(stop, medication),
      );
      if (replaced) paired.add(replaced);
      return { medication, kind: replaced ? 'dose-changed' : 'started', date: medication.startDate };
    });
  for (const stop of stops) {
    if (!paired.has(stop) && stop.stopDate !== undefined) {
      changes.push({ medication: stop, kind: 'stopped', date: stop.stopDate });
    }
  }
  return changes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
};

export const suggestionCandidates = (flags: Flag[], medications: Medication[], at: string): SuggestionCandidate[] => {
  const changes = medicationChangesBefore(medications, at);
  return flags.flatMap((flag) =>
    flag.kind === 'reliable-change' ? changes.map((change) => ({ flag, change })) : [],
  );
};
