import type { PairedDevice } from '@tempo/shared';

export function pairingUrl(origin: string, code: string): string {
  return `${origin}/patient/home?code=${encodeURIComponent(code)}`;
}

export function isExpired(expiresAt: string, now: number): boolean {
  return now >= Date.parse(expiresAt);
}

export function isActive(device: PairedDevice): boolean {
  return device.revokedAt === undefined;
}

function newestFirst(a: string, b: string): number {
  return Date.parse(b) - Date.parse(a);
}

export function orderDevices(devices: readonly PairedDevice[]): PairedDevice[] {
  const active = devices.filter(isActive).sort((a, b) => newestFirst(a.pairedAt, b.pairedAt));
  const revoked = devices
    .filter((device) => !isActive(device))
    .sort((a, b) => newestFirst(a.revokedAt ?? a.pairedAt, b.revokedAt ?? b.pairedAt));
  return [...active, ...revoked];
}

export function newlyPaired(devices: readonly PairedDevice[], knownIds: ReadonlySet<string>): PairedDevice | undefined {
  return orderDevices(devices).find((device) => isActive(device) && !knownIds.has(device.id));
}

export function groupCode(code: string): [string, string] {
  return [code.slice(0, 3), code.slice(3)];
}

export function spellDigits(code: string): string {
  return code.split('').join(' ');
}

export function pairedCountLabel(devices: readonly PairedDevice[]): string {
  const count = devices.filter(isActive).length;
  if (count === 0) return 'Not paired';
  return count === 1 ? '1 phone paired' : `${count} phones paired`;
}
