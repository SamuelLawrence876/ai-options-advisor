import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import type { ErrorResponse, HealthResponse } from '../../models';
import { handler } from './index';

const buildEvent = (path: string): APIGatewayProxyEventV2 =>
  ({
    rawPath: path,
    version: '2.0',
    routeKey: '$default',
    requestContext: {
      http: { method: 'GET', path, protocol: 'HTTP/1.1', sourceIp: '', userAgent: '' },
    } as APIGatewayProxyEventV2['requestContext'],
    headers: {},
    isBase64Encoded: false,
    rawQueryString: '',
  }) as APIGatewayProxyEventV2;

const mockContext: Context = {
  awsRequestId: 'test-request-id',
  functionName: 'test-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:eu-west-1:123:function:test',
  memoryLimitInMB: '256',
  logGroupName: '/aws/lambda/test',
  logStreamName: '2024/01/01/test',
  getRemainingTimeInMillis: () => 5000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
  callbackWaitsForEmptyEventLoop: false,
};

describe('requestHandler', () => {
  beforeEach(() => {
    process.env.SERVICE_NAME = 'test-service';
    process.env.STAGE = 'test';
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('returns 200 with health status for /health', async () => {
    const result = await handler(buildEvent('/health'), mockContext);
    const body = JSON.parse(result.body as string) as HealthResponse;

    expect(result.statusCode).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('test-service');
    expect(body.stage).toBe('test');
  });

  it('returns 404 for an unrecognised path', async () => {
    const result = await handler(buildEvent('/unknown'), mockContext);
    const body = JSON.parse(result.body as string) as ErrorResponse;

    expect(result.statusCode).toBe(404);
    expect(body.error).toBe('Not Found');
  });
});
