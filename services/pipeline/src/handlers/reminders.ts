import { createDynamoStore } from '@tempo/api/store';
import { z } from 'zod';
import { logEmail } from '../email.ts';
import { remindCheckIns } from '../reminders/check-in.ts';
import { remindMissedSessions } from '../reminders/missed-sessions.ts';
import type { ReminderDeps } from '../reminders/ports.ts';
import { createSesEmail } from '../ses-email.ts';

const reminderEventSchema = z.object({ kind: z.enum(['check-in', 'missed-sessions']) });

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

const sender = process.env['REPORT_SENDER'];

const deps: ReminderDeps = {
  store: createDynamoStore({ tableName: requiredEnv('TABLE_NAME') }),
  sendEmail: sender ? createSesEmail(sender) : logEmail,
  clock: () => new Date(),
  appUrl: requiredEnv('APP_URL'),
};

export const handler = async (event: unknown) => {
  const { kind } = reminderEventSchema.parse(event);
  const run = kind === 'check-in' ? await remindCheckIns(deps) : await remindMissedSessions(deps);
  const result = { kind, ...run };
  console.info(JSON.stringify(result));
  if (run.failed > 0) throw new Error(`${run.failed} reminder emails failed (${kind}); the rest were sent`);
  return result;
};
