import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ReportMetadata } from '../../types';
import { dynamoDocumentClient } from './dynamoDocumentClient';

export async function putReportMetadata(
  tableName: string,
  metadata: ReportMetadata,
): Promise<void> {
  await dynamoDocumentClient.send(
    new PutCommand({
      TableName: tableName,
      Item: metadata,
    }),
  );
}
