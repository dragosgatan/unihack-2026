import type { SendEmail } from './ports.ts';

export const logEmail: SendEmail = async ({ to, subject }) => {
  console.info(`Email not sent (no sender configured): "${subject}" to ${to}`);
};
