import type { MedicalRecord, Profile, Sex, Side } from '@tempo/shared';

export const profileLabels: Record<Profile, string> = {
  neurological: 'Neurological / elderly',
  'limb-loss': 'Limb loss',
  sports: 'Sports / orthopaedic',
  concussion: 'Concussion',
};

export const sexLabels: Record<Sex, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
};

export function ageFrom(dateOfBirth: string, today: Date = new Date()): number {
  const [year = 0, month = 1, day = 1] = dateOfBirth.split('-').map(Number);
  const hadBirthday = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  return today.getFullYear() - year - (hadBirthday ? 0 : 1);
}

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

export function formatShortDate(iso: string): string {
  return shortDate.format(new Date(iso));
}

const fullDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(iso: string): string {
  return fullDate.format(new Date(iso));
}

const dateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

const numberFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

const unitLabels: Record<string, string> = {
  count: '',
  '0-10': '/ 10',
  index: '',
};

export function formatUnit(unit: string): string {
  return unitLabels[unit] ?? unit;
}

export function withUnit(value: number, unit: string): string {
  const label = formatUnit(unit);
  return label ? `${formatNumber(value)} ${label}` : formatNumber(value);
}

export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function defaultSide(record: MedicalRecord): Side {
  return record.injury?.side ?? record.affectedLimbs[0]?.side ?? record.dominantHand;
}
