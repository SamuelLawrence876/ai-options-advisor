import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function getItem<T>(
  tableName: string,
  key: Record<string, unknown>,
): Promise<T | undefined> {
  const result = await client.send(new GetCommand({ TableName: tableName, Key: key }));
  return result.Item as T | undefined;
}

export async function scanTable<T>(tableName: string): Promise<T[]> {
  const result = await client.send(new ScanCommand({ TableName: tableName }));
  return (result.Items ?? []) as T[];
}

export async function countItems(tableName: string): Promise<number> {
  const result = await client.send(new ScanCommand({ TableName: tableName, Select: 'COUNT' }));
  return result.Count ?? 0;
}
