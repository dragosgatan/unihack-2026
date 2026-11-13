import { bodyRegionLabel, type Session } from '@tempo/shared';
import { sessionLink, type Email, type PipelineDeps } from '../ports.ts';
import type { SkippedActivityResult } from './results.ts';

export const isPainSkip = (result: SkippedActivityResult): boolean => result.reason === 'pain';

export const painAlertEmail = (to: string, appUrl: string, sessionId: string, skips: SkippedActivityResult[]): Email => ({
  to,
  subject: 'Tempo: an activity was stopped because of pain',
  text: [
    skips.length === 1
      ? 'A patient stopped an activity in a session because of pain.'
      : `A patient stopped ${skips.length} activities in a session because of pain.`,
    ...skips.map((skip) =>
      [
        `Activity: ${skip.activityId}`,
        `Stopped at: ${skip.stage}`,
        `Body-map location: ${skip.painLocation === undefined ? 'not given' : bodyRegionLabel(skip.painLocation, 'en')}`,
      ].join('\n'),
    ),
    sessionLink(appUrl, sessionId),
    'Sign in to Tempo to see the session. This email contains no patient details.',
  ].join('\n\n'),
});

export const alertPainSkips = async (
  { store, sendEmail, appUrl }: PipelineDeps,
  session: Session,
  skipped: SkippedActivityResult[],
): Promise<void> => {
  const painSkips = skipped.filter(isPainSkip);
  if (painSkips.length === 0) return;

  const detail = await store.getPatientDetail(session.patientId);
  const attending = detail && (await store.getStaff(detail.patient.attendingId));
  if (!attending?.email) {
    console.warn(`No attending found to alert about a pain skip in session ${session.id}`);
    return;
  }

  if (!(await store.claimPainAlert(session.id))) return;
  try {
    await sendEmail(painAlertEmail(attending.email, appUrl, session.id, painSkips));
  } catch (error) {
    await store.releasePainAlert(session.id);
    throw error;
  }
};
