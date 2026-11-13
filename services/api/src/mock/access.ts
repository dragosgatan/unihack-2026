import type { Patient, Staff } from '@tempo/shared';
import { bearerToken, HttpError } from './http.ts';
import { mockStaffTokens } from './seed/institution.ts';
import type { MockStore } from './store.ts';

export const resolveStaff = (store: MockStore, authorization: string | undefined): Staff => {
  const token = authorization === undefined ? 'mock-attending' : bearerToken(authorization);
  const staffId = token === undefined ? undefined : mockStaffTokens.get(token);
  const staff = store.staff.find((member) => member.id === staffId);
  if (!staff) throw new HttpError('unauthenticated', 'Unknown or missing staff token');
  return staff;
};

const isAssigned = (staff: Staff, patient: Patient): boolean =>
  patient.attendingId === staff.id || patient.therapistIds.includes(staff.id);

export const visiblePatients = (store: MockStore, staff: Staff): Patient[] =>
  staff.role === 'admin' ? store.patients : store.patients.filter((patient) => isAssigned(staff, patient));

export const clinicalPatient = (store: MockStore, staff: Staff, patientId: string): Patient => {
  if (staff.role === 'admin') throw new HttpError('forbidden', 'Admins do not read clinical detail');
  const patient = store.patients.find((candidate) => candidate.id === patientId);
  if (!patient || !isAssigned(staff, patient)) throw new HttpError('not_found', 'Patient not found');
  return patient;
};
