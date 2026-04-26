import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const dynamoDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
