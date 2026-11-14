import type { MedicalRecord, MedicationCheckInConfig, SessionPlan } from '@tempo/shared';

const currentMedications = (record: MedicalRecord, now: Date): MedicationCheckInConfig['medications'] => {
  const today = now.toISOString().slice(0, 10);
  return record.medications
    .filter((medication) => medication.stopDate === undefined || medication.stopDate > today)
    .map(({ id, name }) => ({ medicationId: id, name }));
};

export const planForDevice = (plan: SessionPlan, record: MedicalRecord | undefined, now: Date): SessionPlan => {
  const medications = record ? currentMedications(record, now) : [];
  if (medications.length === 0) return plan;
  return {
    ...plan,
    items: plan.items.map((item) =>
      item.activityId === 'check-in-medication' && !('medications' in item.config)
        ? { ...item, config: { ...item.config, medications } }
        : item,
    ),
  };
};
