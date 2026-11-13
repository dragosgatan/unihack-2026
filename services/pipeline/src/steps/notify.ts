import type { SessionStatus } from '@tempo/shared';
import { requireSession, type Email, type PipelineDeps } from '../ports.ts';
import type { PipelineInput } from '../state.ts';

export type NotifyOutput = PipelineInput & { status: SessionStatus; notified: boolean };

export const reportEmail = (to: string, appUrl: string, sessionId: string): Email => ({
  to,
  subject: 'Tempo: a session report is ready',
  text: [
    'A session report is ready for you to review.',
    `${appUrl.replace(/\/+$/, '')}/clinician/sessions/${encodeURIComponent(sessionId)}`,
    'Sign in to Tempo to see the report. This email contains no patient details.',
  ].join('\n\n'),
});

export const notify = async (
  { store, sendEmail, clock, appUrl }: PipelineDeps,
  { sessionId }: PipelineInput,
): Promise<NotifyOutput> => {
  const session = await requireSession(store, sessionId);
  const report = await store.getReport(sessionId);
  if (!report) throw new Error(`Session ${sessionId} has no report to send`);

  let notified = report.notifiedAt !== undefined;
  if (!notified) {
    const detail = await store.getPatientDetail(session.patientId);
    const attending = detail && (await store.getStaff(detail.patient.attendingId));
    if (attending) {
      await sendEmail(reportEmail(attending.email, appUrl, sessionId));
      await store.putReport({ ...report, notifiedAt: clock().toISOString() });
      notified = true;
    } else {
      console.warn(`No attending found to notify about session ${sessionId}`);
    }
  }

  const status: SessionStatus = report.skipped.length > 0 ? 'completed-with-skips' : 'processed';
  await store.setSessionStatus(sessionId, status);
  return { sessionId, status, notified };
};
