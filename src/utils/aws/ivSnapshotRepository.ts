import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { IvSnapshot } from '../../types';
import { dynamoDocumentClient } from './dynamoDocumentClient';

export async function putIvSnapshot(tableName: string, snapshot: IvSnapshot): Promise<void> {
  await dynamoDocumentClient.send(
    new PutCommand({
      TableName: tableName,
      Item: snapshot,
    }),
  );
}

export async function getIvSnapshots(
  tableName: string,
  symbol: string,
  beforeDate: string,
  limit = 252,
): Promise<IvSnapshot[]> {
  const result = await dynamoDocumentClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'symbol = :symbol AND #date < :beforeDate',
      ExpressionAttributeNames: { '#date': 'date' },
      ExpressionAttributeValues: { ':symbol': symbol, ':beforeDate': beforeDate },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  return ((result.Items ?? []) as IvSnapshot[]).reverse();
}
