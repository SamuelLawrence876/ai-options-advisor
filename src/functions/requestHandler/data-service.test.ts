import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import 'aws-sdk-client-mock-jest';
import { getItem, queryByPartitionKey } from './data-service';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('data-service', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('getItem', () => {
    it('returns the item when found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: { pk: 'a', sk: 'b', data: 'hello' } });

      const result = await getItem('a', 'b');

      expect(result).toEqual({ pk: 'a', sk: 'b', data: 'hello' });
      expect(ddbMock).toHaveReceivedCommandWith(GetCommand, { Key: { pk: 'a', sk: 'b' } });
    });

    it('returns undefined when item is not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const result = await getItem('missing', 'missing');

      expect(result).toBeUndefined();
    });

    it('propagates DynamoDB errors', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB unavailable'));

      await expect(getItem('a', 'b')).rejects.toThrow('DynamoDB unavailable');
    });
  });

  describe('queryByPartitionKey', () => {
    it('returns matching items', async () => {
      const items = [
        { pk: 'user#1', sk: 'profile', name: 'Alice' },
        { pk: 'user#1', sk: 'settings', theme: 'dark' },
      ];

      ddbMock
        .on(QueryCommand, {
          ExpressionAttributeValues: { ':pk': 'user#1' },
        })
        .resolves({ Items: items });

      const result = await queryByPartitionKey('user#1');

      expect(result).toEqual(items);
    });

    it('returns an empty array when no items match', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: undefined });

      const result = await queryByPartitionKey('unknown');

      expect(result).toEqual([]);
    });
  });
});
