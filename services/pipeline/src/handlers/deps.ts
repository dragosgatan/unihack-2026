import { createDynamoStore } from '@tempo/api/store';
import { aiFromEnv } from '../ai/index.ts';
import { createPipelineAi } from '../ai-port.ts';
import { logEmail } from '../email.ts';
import type { PipelineDeps } from '../ports.ts';
import { createSesEmail } from '../ses-email.ts';

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

const clock = (): Date => new Date();
const sender = process.env['REPORT_SENDER'];

export const deps: PipelineDeps = {
  store: createDynamoStore({ tableName: requiredEnv('TABLE_NAME') }),
  ai: createPipelineAi(aiFromEnv()),
  sendEmail: sender ? createSesEmail(sender) : logEmail,
  clock,
  appUrl: requiredEnv('APP_URL'),
};
