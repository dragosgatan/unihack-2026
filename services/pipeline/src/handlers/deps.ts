import { createDynamoStore } from '@tempo/api/store';
import { aiFromEnv } from '../ai/index.ts';
import { createPipelineAi, type PipelineAi } from '../ai-port.ts';
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

const aiOnFirstUse = (): PipelineAi => {
  let ai: PipelineAi | undefined;
  const get = (): PipelineAi => (ai ??= createPipelineAi(aiFromEnv()));
  return {
    summarizeSession: (input) => get().summarizeSession(input),
    scoreItem: (input) => get().scoreItem(input),
  };
};

export const deps: PipelineDeps = {
  store: createDynamoStore({ tableName: requiredEnv('TABLE_NAME') }),
  ai: aiOnFirstUse(),
  sendEmail: sender ? createSesEmail(sender) : logEmail,
  clock,
  appUrl: requiredEnv('APP_URL'),
};
