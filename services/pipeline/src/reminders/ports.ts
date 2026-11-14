import type { ReminderKind, Store } from '@tempo/api/store';
import type { PairedDevice } from '@tempo/shared';
import type { Email, SendEmail } from '../ports.ts';

export type ReminderStore = Pick<
  Store,
  | 'listInstitutions'
  | 'listPatients'
  | 'getPatientDetail'
  | 'listPatientSessions'
  | 'listCheckIns'
  | 'listDevices'
  | 'getStaff'
  | 'claimReminder'
  | 'releaseReminder'
>;

export type ReminderDeps = {
  store: ReminderStore;
  sendEmail: SendEmail;
  clock: () => Date;
  appUrl: string;
};

export type ReminderRun = { sent: number; failed: number };

export type Claim = { patientId: string; kind: ReminderKind; occurrence: string };

export const appRoot = (appUrl: string): string => `${appUrl.replace(/\/+$/, '')}/`;

export const hasActiveDevice = (devices: PairedDevice[]): boolean => devices.some((device) => !device.revokedAt);

export const sendOrRelease = async (
  { store, sendEmail }: ReminderDeps,
  claim: Claim,
  email: Email,
): Promise<boolean> => {
  try {
    await sendEmail(email);
    return true;
  } catch (error) {
    await store.releaseReminder(claim.patientId, claim.kind, claim.occurrence);
    const reason = error instanceof Error ? error.name : 'unknown error';
    console.error(`Reminder email failed (${claim.kind}, patient ${claim.patientId}, ${claim.occurrence}): ${reason}`);
    return false;
  }
};

export const daysAfter = (instant: Date, days: number): string =>
  new Date(instant.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
