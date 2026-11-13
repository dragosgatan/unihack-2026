import type { MedicalRecord, Patient, Staff } from '@tempo/shared';
import { HttpError } from './http.ts';
import type { PatientDetail, Store } from './store/types.ts';

const isAssigned = (staff: Staff, patient: Patient): boolean =>
  patient.attendingId === staff.id || patient.therapistIds.includes(staff.id);

export const visiblePatients = async (store: Store, staff: Staff): Promise<Patient[]> => {
  const patients = await store.listPatients(staff.institutionId);
  return staff.role === 'admin' ? patients : patients.filter((patient) => isAssigned(staff, patient));
};

export const clinicalPatient = async (store: Store, staff: Staff, patientId: string): Promise<PatientDetail> => {
  if (staff.role === 'admin') throw new HttpError('forbidden', 'Admins do not read clinical detail');
  const detail = await store.getPatientDetail(patientId);
  const visible =
    detail !== undefined && detail.patient.institutionId === staff.institutionId && isAssigned(staff, detail.patient);
  if (!visible) throw new HttpError('not_found', 'Patient not found');
  return detail;
};

export const requireRecord = ({ record }: PatientDetail): MedicalRecord => {
  if (!record) throw new HttpError('internal', 'Patient has no medical record');
  return record;
};
