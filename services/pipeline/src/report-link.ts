import { randomBytes } from 'node:crypto';
import { reportLinkUrl } from '@tempo/shared';
import type { ReportLink } from '@tempo/api/store';
import type { PipelineStore } from './ports.ts';

export const createReportLink = async (
  store: Pick<PipelineStore, 'putReportLink'>,
  sessionId: string,
  now: Date,
  lifetimeMs: number,
): Promise<ReportLink & { url: string }> => {
  const link = {
    token: randomBytes(32).toString('base64url'),
    sessionId,
    expiresAt: new Date(now.getTime() + lifetimeMs).toISOString(),
  };
  await store.putReportLink(link);
  return { ...link, url: reportLinkUrl(link.token) };
};
