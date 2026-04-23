import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { HumanContextEntry, IvSnapshot, ReportMetadata, WatchlistItem } from '../types';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function getActiveWatchlist(tableName: string): Promise<WatchlistItem[]> {
  const result = await client.send(new ScanCommand({ TableName: tableName }));
  const items = (result.Items ?? []) as WatchlistItem[];
  return items.filter((item) => item.active);
}

export async function getHumanContext(
  tableName: string,
  symbol: string,
): Promise<HumanContextEntry[]> {
  const now = new Date().toISOString().slice(0, 10);

  const [tickerResult, globalResult] = await Promise.all([
    client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': symbol },
      }),
    ),
    client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': 'GLOBAL' },
      }),
    ),
  ]);

  const all = [
    ...((tickerResult.Items ?? []) as HumanContextEntry[]),
    ...((globalResult.Items ?? []) as HumanContextEntry[]),
  ];

  return all.filter((entry) => !entry.expires || entry.expires >= now);
}

export async function putIvSnapshot(tableName: string, snapshot: IvSnapshot): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: snapshot,
    }),
  );
}

export async function putReportMetadata(
  tableName: string,
  metadata: ReportMetadata,
): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: metadata,
    }),
  );
}
