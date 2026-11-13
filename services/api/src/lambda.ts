import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { handle } from 'hono/aws-lambda';
import { createCognitoStaffAuth } from './auth/staff.ts';
import { cacheSuccess } from './cache.ts';
import { createApp } from './create-app.ts';
import { createStepFunctionsStarter } from './pipeline-starter.ts';
import { createDynamoStore } from './store/dynamo.ts';

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

const clock = (): Date => new Date();
const store = createDynamoStore({ tableName: requiredEnv('TABLE_NAME') });
const secretArn = requiredEnv('DEVICE_TOKEN_SECRET_ARN');
const secrets = new SecretsManagerClient({});

const tokenSecret = cacheSuccess(async () => {
  const { SecretString } = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!SecretString) throw new Error('Device token secret is empty');
  return SecretString;
});

const staffAuth = createCognitoStaffAuth({
  store,
  region: requiredEnv('AWS_REGION'),
  userPoolId: requiredEnv('USER_POOL_ID'),
  clientId: requiredEnv('USER_POOL_CLIENT_ID'),
  clock,
});

const startPipeline = createStepFunctionsStarter(requiredEnv('STATE_MACHINE_ARN'));

export const handler = handle(createApp({ store, staffAuth, tokenSecret, clock, startPipeline }));
