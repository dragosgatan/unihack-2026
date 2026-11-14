import { localDate, sessionDue, type Institution, type Patient, type Session, type SessionPlan } from '@tempo/shared';
import { missedSessionsEmail, sessionReminderEmail } from './emails.ts';
import { daysAfter, hasActiveDevice, sendOrRelease, type Claim, type ReminderDeps, type ReminderRun } from './ports.ts';

const keepClaimDays = 180;

const lastSessionAt = (sessions: Session[], plan: SessionPlan): string =>
  sessions.reduce<string | undefined>(
    (latest, { submittedAt }) => (submittedAt && (!latest || submittedAt > latest) ? submittedAt : latest),
    undefined,
  ) ?? plan.updatedAt;

const claimMissed = async (
  deps: ReminderDeps,
  institution: Institution,
  patient: Patient,
  run: ReminderRun,
): Promise<Claim | undefined> => {
  const { store, clock, appUrl } = deps;
  const plan = (await store.getPatientDetail(patient.id))?.plan;
  if (!plan) return undefined;

  const now = clock();
  const due = sessionDue(plan.schedule, lastSessionAt(await store.listPatientSessions(patient.id), plan), now);
  if (!due.missed) return undefined;

  const claim: Claim = {
    patientId: patient.id,
    kind: 'missed-session',
    occurrence: localDate(due.dueAt, institution.timezone),
  };
  if (!(await store.claimReminder(claim.patientId, claim.kind, claim.occurrence, daysAfter(now, keepClaimDays)))) {
    return undefined;
  }

  if (patient.reminderEmail && hasActiveDevice(await store.listDevices(patient.id))) {
    if (!(await sendOrRelease(deps, claim, sessionReminderEmail(patient.reminderEmail, appUrl, plan.language)))) {
      run.failed += 1;
      return undefined;
    }
    run.sent += 1;
  }
  return claim;
};

const notifyAttending = async (deps: ReminderDeps, attendingId: string, claims: Claim[], run: ReminderRun) => {
  const attending = await deps.store.getStaff(attendingId);
  if (!attending) {
    console.warn(`No attending ${attendingId} found to tell about ${claims.length} sessions past their schedule`);
    return;
  }
  try {
    await deps.sendEmail(missedSessionsEmail(attending.email, deps.appUrl, claims.length));
    run.sent += 1;
  } catch (error) {
    for (const { patientId, kind, occurrence } of claims) await deps.store.releaseReminder(patientId, kind, occurrence);
    const reason = error instanceof Error ? error.name : 'unknown error';
    console.error(`Missed-session email to attending ${attendingId} failed: ${reason}`);
    run.failed += 1;
  }
};

export const remindMissedSessions = async (deps: ReminderDeps): Promise<ReminderRun> => {
  const run: ReminderRun = { sent: 0, failed: 0 };
  const byAttending = new Map<string, Claim[]>();
  for (const institution of await deps.store.listInstitutions()) {
    for (const patient of await deps.store.listPatients(institution.id)) {
      const claim = await claimMissed(deps, institution, patient, run);
      if (claim) byAttending.set(patient.attendingId, [...(byAttending.get(patient.attendingId) ?? []), claim]);
    }
  }
  for (const [attendingId, claims] of byAttending) await notifyAttending(deps, attendingId, claims, run);
  return run;
};
