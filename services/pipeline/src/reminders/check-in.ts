import { localDate, type Institution, type Patient } from '@tempo/shared';
import { checkInReminderEmail } from './emails.ts';
import { daysAfter, hasActiveDevice, sendOrRelease, type ReminderDeps, type ReminderRun } from './ports.ts';

type Outcome = 'sent' | 'failed' | 'none';

const remindPatient = async (deps: ReminderDeps, institution: Institution, patient: Patient): Promise<Outcome> => {
  const { store, clock, appUrl } = deps;
  if (!patient.reminderEmail) return 'none';
  const plan = (await store.getPatientDetail(patient.id))?.plan;
  if (!plan || !hasActiveDevice(await store.listDevices(patient.id))) return 'none';

  const now = clock();
  const today = localDate(now, institution.timezone);
  const recent = await store.listCheckIns(patient.id, { from: daysAfter(now, -2), to: now.toISOString() });
  if (recent.some((entry) => localDate(entry.recordedAt, institution.timezone) === today)) return 'none';

  if (!(await store.claimReminder(patient.id, 'check-in', today, daysAfter(now, 3)))) return 'none';
  const claim = { patientId: patient.id, kind: 'check-in', occurrence: today } as const;
  const sent = await sendOrRelease(deps, claim, checkInReminderEmail(patient.reminderEmail, appUrl, plan.language));
  return sent ? 'sent' : 'failed';
};

export const remindCheckIns = async (deps: ReminderDeps): Promise<ReminderRun> => {
  const run: ReminderRun = { sent: 0, failed: 0 };
  for (const institution of await deps.store.listInstitutions()) {
    for (const patient of await deps.store.listPatients(institution.id)) {
      const outcome = await remindPatient(deps, institution, patient);
      if (outcome !== 'none') run[outcome] += 1;
    }
  }
  return run;
};
