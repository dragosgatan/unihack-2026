import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { apiErrorSchema, type RouteDefinition } from '@tempo/shared';
import { expect } from 'vitest';
import type { z } from 'zod';
import { createMockStaffAuth } from '../auth/staff.ts';
import { createApp } from '../create-app.ts';
import type { Seed } from '../mock/seed/build.ts';
import { mockStaffTokens } from '../mock/seed/institution.ts';
import { call, fixedNow } from '../mock/testing.ts';
import { createDynamoStore } from '../store/dynamo.ts';
import { loadSeed } from '../store/load-seed.ts';
import { createMemoryStore } from '../store/memory.ts';
import type { Store } from '../store/types.ts';

export type Harness = {
  app: Hono;
  seed: Seed;
  startedPipelines: string[];
  id: (seedId: string) => string;
  setNow: (now: Date) => void;
};

export type HarnessFactory = (seed: Seed) => Promise<Harness>;

const suiteSecret = 'tempo-suite-device-token-secret';

const harnessFor = (store: Store, seed: Seed, ids: ReadonlyMap<string, string>): Harness => {
  let now = fixedNow;
  const startedPipelines: string[] = [];
  const tokens = new Map([...mockStaffTokens].map(([token, staffId]) => [token, ids.get(staffId) ?? staffId]));
  const app = createApp({
    store,
    staffAuth: createMockStaffAuth(store, tokens),
    tokenSecret: async () => suiteSecret,
    clock: () => now,
    startPipeline: async (sessionId) => {
      startedPipelines.push(sessionId);
    },
  });
  return {
    app,
    seed,
    startedPipelines,
    id: (seedId) => ids.get(seedId) ?? seedId,
    setNow: (next) => {
      now = next;
    },
  };
};

export const memoryHarness: HarnessFactory = async (seed) => harnessFor(createMemoryStore(seed), seed, new Map());

export const dynamoHarness =
  (tableName: string): HarnessFactory =>
  async (seed) => {
    const suffix = `-${randomUUID().slice(0, 8)}`;
    const seedIds = [
      seed.institution.id,
      ...seed.staff.map((staff) => staff.id),
      ...seed.patients.map((patient) => patient.id),
      ...seed.plans.map((plan) => plan.id),
      ...seed.sessions.map((session) => session.id),
    ];
    const ids = new Map(seedIds.map((id) => [id, `${id}${suffix}`]));
    const store = createDynamoStore({ tableName });
    await loadSeed(store, seed, ids);
    return harnessFor(store, seed, ids);
  };

export type Result = { status: number; body: unknown };

export const expectError = (result: Result, status: number, code: string): void => {
  expect(result.status).toBe(status);
  expect(apiErrorSchema.parse(result.body).error.code).toBe(code);
};

const parseWith = <Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> => schema.parse(value);

export const expectOk = <Schema extends z.ZodType>(
  route: RouteDefinition & { response: Schema },
  result: Result,
): z.output<Schema> => {
  expect(result.status).toBe(200);
  expect(route.response.safeParse(result.body).error).toBeUndefined();
  return parseWith(route.response, result.body);
};

export { call, fixedNow };
