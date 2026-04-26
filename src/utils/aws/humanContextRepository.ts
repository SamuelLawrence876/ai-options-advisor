import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { HumanContextEntry } from '../../types';
import { dynamoDocumentClient } from './dynamoDocumentClient';

export async function getHumanContext(
  tableName: string,
  symbol: string,
): Promise<HumanContextEntry[]> {
  const now = new Date().toISOString().slice(0, 10);

  const [tickerResult, globalResult] = await Promise.all([
    dynamoDocumentClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': symbol },
      }),
    ),
    dynamoDocumentClient.send(
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

  return all.filter(entry => !entry.expires || entry.expires >= now);
}
