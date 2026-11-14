import type { Hono } from 'hono';
import { aiFromEnv, createPipelineAi, logEmail, runPipeline } from '@tempo/pipeline';
import { createMockStaffAuth } from '../auth/staff.ts';
import { createApp } from '../create-app.ts';
import { offlinePublicData } from '../public-data/index.ts';
import { createMemoryStore } from '../store/memory.ts';
import type { Store } from '../store/types.ts';
import { buildSeed, demoSessionCodes, type Seed } from './seed/build.ts';
import { mockStaffTokens } from './seed/institution.ts';

const mockDeviceTokenSecret = 'tempo-mock-device-token-secret';
const mockAppUrl = 'http://localhost:5173';

export type MockAppOptions = { clock?: () => Date; seed?: Seed; store?: Store };

export const createMockApp = ({ clock = () => new Date(), seed, store: given }: MockAppOptions = {}): Hono => {
  const store = given ?? createMemoryStore(seed ?? buildSeed(clock()));
  const ai = aiFromEnv();
  const pipeline = {
    store,
    ai: createPipelineAi(ai),
    publicData: offlinePublicData,
    sendEmail: logEmail,
    clock,
    appUrl: mockAppUrl,
  };
  return createApp({
    store,
    staffAuth: createMockStaffAuth(store, mockStaffTokens),
    tokenSecret: async () => mockDeviceTokenSecret,
    clock,
    startPipeline: async (sessionId) => {
      await runPipeline(pipeline, { sessionId });
    },
    publicData: offlinePublicData,
    ai,
    demoSessionCodes,
  });
};
