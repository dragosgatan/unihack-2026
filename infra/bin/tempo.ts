import { App } from 'aws-cdk-lib';
import { TempoStack } from '../lib/tempo-stack.ts';

const app = new App();

new TempoStack(app, 'TempoStack', { env: { region: 'eu-central-1' } });
