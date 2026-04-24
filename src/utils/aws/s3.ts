import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({});

export async function getJson<T>(bucket: string, key: string): Promise<T> {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await response.Body?.transformToString();
  if (!body) throw new Error(`Empty body for s3://${bucket}/${key}`);
  return JSON.parse(body) as T;
}

export async function putJson(bucket: string, key: string, data: unknown): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    }),
  );
}

export async function putMarkdown(bucket: string, key: string, content: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: content,
      ContentType: 'text/markdown; charset=utf-8',
    }),
  );
}

export async function getText(bucket: string, key: string): Promise<string> {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await response.Body?.transformToString();
  if (!body) throw new Error(`Empty body for s3://${bucket}/${key}`);
  return body;
}

export async function getPresignedUrl(
  bucket: string,
  key: string,
  expiresInSeconds: number,
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}
