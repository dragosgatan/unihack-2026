import { createMemoryStore, type Store } from '@tempo/api/store';
import type { Language, Patient, Session, SessionPlan } from '@tempo/shared';
import { describe, expect, it } from 'vitest';
import type { Email } from '../ports.ts';
import { attending, now, patient } from '../testing.ts';
import { remindCheckIns } from './check-in.ts';
import { remindMissedSessions } from './missed-sessions.ts';
import type { ReminderDeps } from './ports.ts';

const institution = { id: 'inst-1', name: 'Riverside Rehabilitation Centre', timezone: 'Europe/Bucharest' };
const appUrl = 'https://tempo.example.test/';

type Setup = { store: Store; deps: ReminderDeps; emails: Email[]; failFor: Set<string> };

const setup = async (): Promise<Setup> => {
  const store = createMemoryStore();
  await store.putInstitution(institution);
  await store.putStaff(attending);
  const emails: Email[] = [];
  const failFor = new Set<string>();
  const deps: ReminderDeps = {
    store,
    sendEmail: async (email) => {
      if (failFor.has(email.to)) throw new Error(`Address not verified: ${email.to}`);
      emails.push(email);
    },
    clock: () => now,
    appUrl,
  };
  return { store, deps, emails, failFor };
};

type PatientOptions = {
  email?: string;
  device?: 'active' | 'revoked' | 'none';
  plan?: boolean;
  language?: Language;
  submittedAt?: string[];
};

const addPatient = async (
  store: Store,
  id: string,
  { email = `${id}@example.test`, device = 'active', plan = true, language = 'en', submittedAt = [] }: PatientOptions = {},
): Promise<Patient> => {
  const added: Patient = { ...patient, id, institutionPatientId: `RRC-${id}`, ...(email ? { reminderEmail: email } : {}) };
  await store.putPatient(added);
  if (plan) {
    const sessionPlan: SessionPlan = {
      id: `plan-${id}`,
      version: 1,
      patientId: id,
      items: [{ activityId: 'finger-tapping', kind: 'test', config: {} }],
      schedule: { sessions: 2, per: 'week' },
      language,
      createdBy: attending.id,
      updatedAt: '2026-10-01T08:10:00.000Z',
    };
    await store.putPlan(sessionPlan);
  }
  if (device !== 'none') {
    await store.putDevice({
      id: `dev-${id}`,
      patientId: id,
      pairedAt: '2026-10-02T09:00:00.000Z',
      ...(device === 'revoked' ? { revokedAt: '2026-10-05T09:00:00.000Z', revokedBy: attending.id } : {}),
    });
  }
  for (const [index, at] of submittedAt.entries()) {
    const session: Session = {
      id: `sess-${id}-${index}`,
      patientId: id,
      planId: `plan-${id}`,
      planVersion: 1,
      mode: 'home',
      status: 'in-progress',
      partial: false,
      createdAt: at,
    };
    await store.putSession(session);
    await store.submitSession(session, {
      partial: false,
      submittedAt: at,
      results: [
        {
          status: 'completed',
          completedAt: at,
          raw: { activityId: 'check-in-pain', data: { item: 'pain', intensity: 2, location: 'right-shoulder' } },
        },
      ],
    });
  }
  return added;
};

const recipients = (emails: Email[]): string[] => emails.map((email) => email.to).sort();

describe('remindCheckIns', () => {
  it('emails a patient with a paired phone and a plan once a day, in the plan language, with no details', async () => {
    const { store, deps, emails } = await setup();
    const added = await addPatient(store, 'pat-ro', { language: 'ro' });

    expect(await remindCheckIns(deps)).toEqual({ sent: 1, failed: 0 });
    expect(emails).toEqual([
      {
        to: 'pat-ro@example.test',
        subject: 'Tempo: check-in-ul de azi este pregătit',
        text: 'Check-in-ul de azi este pregătit. Deschideți Tempo când vă este comod.\n\nhttps://tempo.example.test/',
      },
    ]);
    expect(JSON.stringify(emails)).not.toContain(added.name);

    expect(await remindCheckIns(deps)).toEqual({ sent: 0, failed: 0 });
    expect(emails).toHaveLength(1);
  });

  it('writes in English for an English plan', async () => {
    const { store, deps, emails } = await setup();
    await addPatient(store, 'pat-en');
    await remindCheckIns(deps);
    expect(emails[0]?.subject).toBe('Tempo: your check-in for today is ready');
    expect(emails[0]?.text).toBe(
      'Your check-in for today is ready. Open Tempo whenever it suits you.\n\nhttps://tempo.example.test/',
    );
  });

  it('skips patients without an address, a usable device or a plan', async () => {
    const { store, deps, emails } = await setup();
    await addPatient(store, 'pat-no-email', { email: '' });
    await addPatient(store, 'pat-revoked', { device: 'revoked' });
    await addPatient(store, 'pat-no-device', { device: 'none' });
    await addPatient(store, 'pat-no-plan', { plan: false });

    expect(await remindCheckIns(deps)).toEqual({ sent: 0, failed: 0 });
    expect(emails).toEqual([]);
  });

  it('counts a check-in by the local date of the institution', async () => {
    const { store, deps, emails } = await setup();
    await addPatient(store, 'pat-after-midnight', { submittedAt: ['2026-11-12T22:30:00.000Z'] });
    await addPatient(store, 'pat-before-midnight', { submittedAt: ['2026-11-12T21:30:00.000Z'] });

    await remindCheckIns(deps);
    expect(recipients(emails)).toEqual(['pat-before-midnight@example.test']);
  });

  it('keeps going past a failed address and tries it again on the next run', async () => {
    const { store, deps, emails, failFor } = await setup();
    await addPatient(store, 'pat-a');
    await addPatient(store, 'pat-b');
    await addPatient(store, 'pat-c');
    failFor.add('pat-b@example.test');

    expect(await remindCheckIns(deps)).toEqual({ sent: 2, failed: 1 });
    expect(recipients(emails)).toEqual(['pat-a@example.test', 'pat-c@example.test']);

    failFor.clear();
    expect(await remindCheckIns(deps)).toEqual({ sent: 1, failed: 0 });
    expect(emails.at(-1)?.to).toBe('pat-b@example.test');
  });
});

describe('remindMissedSessions', () => {
  const attendingSubject = 'Tempo: sessions past their schedule';

  it('invites each patient with a phone once and tells the attending how many, with no patient details', async () => {
    const { store, deps, emails } = await setup();
    const missed = await addPatient(store, 'pat-missed', { submittedAt: ['2026-11-01T10:00:00.000Z'] });
    await addPatient(store, 'pat-kiosk', { device: 'none', submittedAt: ['2026-11-02T10:00:00.000Z'] });
    await addPatient(store, 'pat-never', { device: 'revoked' });
    await addPatient(store, 'pat-on-time', { submittedAt: ['2026-11-12T10:00:00.000Z'] });
    await addPatient(store, 'pat-no-plan', { plan: false });

    expect(await remindMissedSessions(deps)).toEqual({ sent: 2, failed: 0 });
    expect(emails).toEqual([
      {
        to: 'pat-missed@example.test',
        subject: 'Tempo: a session is ready for you',
        text: 'A session is ready for you in Tempo. Open it whenever it suits you.\n\nhttps://tempo.example.test/',
      },
      {
        to: attending.email,
        subject: attendingSubject,
        text: [
          '3 of your patients have a session that is more than a day past its schedule.',
          'https://tempo.example.test/clinician',
          'Sign in to Tempo to see your caseload. This email contains no patient details.',
        ].join('\n\n'),
      },
    ]);
    const sent = JSON.stringify(emails.map(({ subject, text }) => ({ subject, text })));
    expect(sent).not.toContain(missed.name);
    expect(sent).not.toContain('pat-');
    expect(sent).not.toContain('RRC-');

    expect(await remindMissedSessions(deps)).toEqual({ sent: 0, failed: 0 });
    expect(emails).toHaveLength(2);
  });

  it('announces the next missed session again after the patient caught up', async () => {
    const { store, deps, emails } = await setup();
    await addPatient(store, 'pat-1', { device: 'none', submittedAt: ['2026-11-01T10:00:00.000Z'] });
    await remindMissedSessions(deps);
    expect(emails).toHaveLength(1);

    const later = new Date('2026-11-20T12:00:00.000Z');
    await addPatient(store, 'pat-1', {
      device: 'none',
      submittedAt: ['2026-11-01T10:00:00.000Z', '2026-11-14T10:00:00.000Z'],
    });
    expect(await remindMissedSessions({ ...deps, clock: () => later })).toEqual({ sent: 1, failed: 0 });
    expect(emails.at(-1)?.text).toContain('One of your patients has a session');
  });

  it('sends nothing when no patient newly missed a session', async () => {
    const { store, deps, emails } = await setup();
    await addPatient(store, 'pat-on-time', { submittedAt: ['2026-11-12T10:00:00.000Z'] });
    expect(await remindMissedSessions(deps)).toEqual({ sent: 0, failed: 0 });
    expect(emails).toEqual([]);
  });

  it('leaves a patient whose email failed out of the count and retries them next run', async () => {
    const { store, deps, emails, failFor } = await setup();
    await addPatient(store, 'pat-a', { submittedAt: ['2026-11-01T10:00:00.000Z'] });
    await addPatient(store, 'pat-b', { submittedAt: ['2026-11-01T10:00:00.000Z'] });
    failFor.add('pat-a@example.test');

    expect(await remindMissedSessions(deps)).toEqual({ sent: 2, failed: 1 });
    expect(recipients(emails)).toEqual([attending.email, 'pat-b@example.test']);
    expect(emails.at(-1)?.text).toContain('One of your patients');

    failFor.clear();
    expect(await remindMissedSessions(deps)).toEqual({ sent: 2, failed: 0 });
    expect(emails.slice(2).map((email) => email.to)).toEqual(['pat-a@example.test', attending.email]);
  });

  it('releases the claims when the attending email fails so the next run tells them', async () => {
    const { store, deps, emails, failFor } = await setup();
    await addPatient(store, 'pat-a', { device: 'none', submittedAt: ['2026-11-01T10:00:00.000Z'] });
    failFor.add(attending.email);

    expect(await remindMissedSessions(deps)).toEqual({ sent: 0, failed: 1 });
    failFor.clear();
    expect(await remindMissedSessions(deps)).toEqual({ sent: 1, failed: 0 });
    expect(emails.map((email) => email.subject)).toEqual([attendingSubject]);
  });
});
