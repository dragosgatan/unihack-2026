import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

export const cachedSecret = (read: () => Promise<string>): (() => Promise<string>) => {
  let cached: Promise<string> | undefined;
  return () => {
    if (cached) return cached;
    const loading = read();
    loading.catch(() => {
      cached = undefined;
    });
    cached = loading;
    return loading;
  };
};

export const secretsManagerString = (secretArn: string, client = new SecretsManagerClient({})) =>
  cachedSecret(async () => {
    const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    if (!SecretString) throw new Error('Gemini API key secret is empty');
    return SecretString.trim();
  });
