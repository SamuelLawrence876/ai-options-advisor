import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { WatchlistItem } from '../../types';
import { dynamoDocumentClient } from './dynamoDocumentClient';

export async function getActiveWatchlist(tableName: string): Promise<WatchlistItem[]> {
  const result = await dynamoDocumentClient.send(new ScanCommand({ TableName: tableName }));
  const items = (result.Items ?? []) as WatchlistItem[];
  return items.filter(item => item.active);
}
