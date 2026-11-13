import { describe } from 'vitest';
import { accessSuite } from './access.ts';
import { contractSuite } from './contract.ts';
import { memoryHarness } from './harness.ts';
import { pairingSuite } from './pairing.ts';
import { sessionFlowSuite } from './session-flow.ts';

describe('memory store', () => {
  describe('contract', () => contractSuite(memoryHarness));
  describe('access', () => accessSuite(memoryHarness));
  describe('sessions', () => sessionFlowSuite(memoryHarness));
  describe('pairing', () => pairingSuite(memoryHarness));
});
