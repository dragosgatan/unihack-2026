import { describe } from 'vitest';
import { createMemoryStore } from '../store/memory.ts';
import { accessSuite } from './access.ts';
import { contractSuite } from './contract.ts';
import { memoryHarness } from './harness.ts';
import { pairingSuite } from './pairing.ts';
import { sessionFlowSuite } from './session-flow.ts';
import { storeSuite } from './store.ts';

describe('memory store', () => {
  describe('store', () => storeSuite(() => createMemoryStore()));
  describe('contract', () => contractSuite(memoryHarness));
  describe('access', () => accessSuite(memoryHarness));
  describe('sessions', () => sessionFlowSuite(memoryHarness));
  describe('pairing', () => pairingSuite(memoryHarness));
});
