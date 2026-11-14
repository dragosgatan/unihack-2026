import { describe } from 'vitest';
import { createMemoryStore } from '../store/memory.ts';
import { accessSuite } from './access.ts';
import { assistantSuite } from './assistant.ts';
import { checkInsSuite } from './check-ins.ts';
import { contractSuite } from './contract.ts';
import { memoryHarness } from './harness.ts';
import { pairingSuite } from './pairing.ts';
import { reportsSuite } from './reports.ts';
import { sessionFlowSuite } from './session-flow.ts';
import { storeSuite } from './store.ts';
import { suggestionsSuite } from './suggestions.ts';

describe('memory store', () => {
  describe('store', () => storeSuite(() => createMemoryStore()));
  describe('contract', () => contractSuite(memoryHarness));
  describe('access', () => accessSuite(memoryHarness));
  describe('sessions', () => sessionFlowSuite(memoryHarness));
  describe('pairing', () => pairingSuite(memoryHarness));
  describe('suggestions', () => suggestionsSuite(memoryHarness));
  describe('assistant', () => assistantSuite(memoryHarness));
  describe('reports', () => reportsSuite(memoryHarness));
  describe('check-ins', () => checkInsSuite(memoryHarness));
});
