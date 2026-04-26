import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from './s3Client';

export async function getJson<T>(bucket: string, key: string): Promise<T> {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await response.Body?.transformToString();
  if (!body) throw new Error(`Empty body for s3://${bucket}/${key}`);
  return JSON.parse(body) as T;
}

export async function putJson(bucket: string, key: string, data: unknown): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    }),
  );
}
