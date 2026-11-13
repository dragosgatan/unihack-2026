import type { Hono } from 'hono';
import { createMockStaffAuth } from '../auth/staff.ts';
import { createApp } from '../create-app.ts';
import { createMemoryStore } from '../store/memory.ts';
import { buildSeed, demoSessionCodes, type Seed } from './seed/build.ts';
import { mockStaffTokens } from './seed/institution.ts';

const mockDeviceTokenSecret = 'tempo-mock-device-token-secret';

export type MockAppOptions = { clock?: () => Date; seed?: Seed };

export const createMockApp = ({ clock = () => new Date(), seed }: MockAppOptions = {}): Hono => {
  const store = createMemoryStore(seed ?? buildSeed(clock()));
  return createApp({
    store,
    staffAuth: createMockStaffAuth(store, mockStaffTokens),
    tokenSecret: async () => mockDeviceTokenSecret,
    clock,
    demoSessionCodes,
  });
};
