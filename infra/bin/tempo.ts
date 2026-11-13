import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { TempoStack } from '../lib/tempo-stack.ts';

const app = new App();

new TempoStack(app, 'TempoStack', {
  env: { region: 'eu-central-1' },
  apiBundleDir: fileURLToPath(new URL('../../services/api/dist', import.meta.url)),
  pipelineBundleDir: fileURLToPath(new URL('../../services/pipeline/dist', import.meta.url)),
  webDistDir: fileURLToPath(new URL('../../apps/web/dist', import.meta.url)),
});
