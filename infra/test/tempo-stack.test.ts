import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { TempoStack } from '../lib/tempo-stack.ts';

describe('TempoStack', () => {
  it('synthesises in eu-central-1', () => {
    const app = new App();
    const stack = new TempoStack(app, 'TempoStack', { env: { region: 'eu-central-1' } });
    Template.fromStack(stack);
    expect(stack.region).toBe('eu-central-1');
  });
});
