import type { Language } from '@tempo/shared';
import type { Email } from '../ports.ts';
import { appRoot } from './ports.ts';

const checkInText = {
  en: {
    subject: 'Tempo: your check-in for today is ready',
    body: 'Your check-in for today is ready. Open Tempo whenever it suits you.',
  },
  ro: {
    subject: 'Tempo: check-in-ul de azi este pregătit',
    body: 'Check-in-ul de azi este pregătit. Deschideți Tempo când vă este comod.',
  },
} satisfies Record<Language, { subject: string; body: string }>;

const sessionText = {
  en: {
    subject: 'Tempo: a session is ready for you',
    body: 'A session is ready for you in Tempo. Open it whenever it suits you.',
  },
  ro: {
    subject: 'Tempo: o sesiune vă așteaptă',
    body: 'O sesiune vă așteaptă în Tempo. Deschideți aplicația când vă este comod.',
  },
} satisfies Record<Language, { subject: string; body: string }>;

export const checkInReminderEmail = (to: string, appUrl: string, language: Language): Email => ({
  to,
  subject: checkInText[language].subject,
  text: [checkInText[language].body, appRoot(appUrl)].join('\n\n'),
});

export const sessionReminderEmail = (to: string, appUrl: string, language: Language): Email => ({
  to,
  subject: sessionText[language].subject,
  text: [sessionText[language].body, appRoot(appUrl)].join('\n\n'),
});

export const missedSessionsEmail = (to: string, appUrl: string, patients: number): Email => ({
  to,
  subject: 'Tempo: sessions past their schedule',
  text: [
    patients === 1
      ? 'One of your patients has a session that is more than a day past its schedule.'
      : `${patients} of your patients have a session that is more than a day past its schedule.`,
    `${appRoot(appUrl)}clinician`,
    'Sign in to Tempo to see your caseload. This email contains no patient details.',
  ].join('\n\n'),
});
