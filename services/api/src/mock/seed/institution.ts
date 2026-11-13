import type { Institution, Staff } from '@tempo/shared';

export const institution = {
  id: 'inst-1',
  name: 'Riverside Rehabilitation Centre',
  timezone: 'Europe/Bucharest',
} satisfies Institution;

export const admin = {
  id: 'staff-adm-1',
  institutionId: institution.id,
  role: 'admin',
  name: 'Ioana Stan',
  email: 'ioana.stan@example.test',
} satisfies Staff;

export const attending = {
  id: 'staff-att-1',
  institutionId: institution.id,
  role: 'attending',
  name: 'Dr. Mara Velescu',
  email: 'mara.velescu@example.test',
} satisfies Staff;

export const therapist = {
  id: 'staff-ther-1',
  institutionId: institution.id,
  role: 'therapist',
  name: 'Tomas Ilie',
  email: 'tomas.ilie@example.test',
} satisfies Staff;

export const mockStaffTokens: ReadonlyMap<string, string> = new Map([
  ['mock-admin', admin.id],
  ['mock-attending', attending.id],
  ['mock-therapist', therapist.id],
]);
