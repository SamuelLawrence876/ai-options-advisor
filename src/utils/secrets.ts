import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});
const cache = new Map<string, string>();

export async function getSecretValue(secretArn: string): Promise<string> {
  const cached = cache.get(secretArn);
  if (cached) return cached;

  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const value = response.SecretString;
  if (!value) throw new Error(`Secret ${secretArn} has no string value`);

  cache.set(secretArn, value);
  return value;
}
