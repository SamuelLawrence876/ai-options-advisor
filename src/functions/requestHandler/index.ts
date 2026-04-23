import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import type { ErrorResponse, HealthResponse } from '../../models';
import * as log from '../../utils/logger';
import { getEnvironment } from './environment';

const json = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const handler = (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { serviceName, stage } = getEnvironment();

  log.info('request received', {
    requestId: context.awsRequestId,
    path: event.rawPath,
    method: event.requestContext.http?.method,
  });

  if (event.rawPath === '/health') {
    const body: HealthResponse = { status: 'healthy', service: serviceName, stage };
    return Promise.resolve(json(200, body));
  }

  log.warn('unmatched route', { path: event.rawPath });

  const body: ErrorResponse = { error: 'Not Found', message: `No handler for ${event.rawPath}` };
  return Promise.resolve(json(404, body));
};
