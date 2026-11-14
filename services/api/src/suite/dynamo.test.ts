import { describe, it, vi } from 'vitest';
import { createDynamoStore } from '../store/dynamo.ts';
import { accessSuite } from './access.ts';
import { assistantSuite } from './assistant.ts';
import { contractSuite } from './contract.ts';
import { dynamoHarness } from './harness.ts';
import { pairingSuite } from './pairing.ts';
import { reportsSuite } from './reports.ts';
import { sessionFlowSuite } from './session-flow.ts';
import { storeSuite } from './store.ts';
import { suggestionsSuite } from './suggestions.ts';

const tableName = process.env['TEMPO_TEST_TABLE'];

if (tableName) {
  const harness = dynamoHarness(tableName);
  vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });
  describe('DynamoDB store', () => {
    describe('store', () => storeSuite(() => createDynamoStore({ tableName })));
    describe('contract', () => contractSuite(harness));
    describe('access', () => accessSuite(harness));
    describe('sessions', () => sessionFlowSuite(harness));
    describe('pairing', () => pairingSuite(harness));
    describe('suggestions', () => suggestionsSuite(harness));
    describe('assistant', () => assistantSuite(harness));
    describe('reports', () => reportsSuite(harness));
  });
} else {
  describe('DynamoDB store', () => {
    it.skip('runs when TEMPO_TEST_TABLE names a table', () => {});
  });
}
