import {
  InvocationResponse,
  InvokeCommand,
  LambdaClient,
  LogType,
} from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});

export interface InvokeResult<T = unknown> {
  statusCode: number;
  payload: T;
  logResult?: string;
}

export async function invokeLambda<T = unknown>(
  functionName: string,
  payload: unknown,
): Promise<InvokeResult<T>> {
  const response: InvocationResponse = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify(payload),
      LogType: LogType.Tail,
    }),
  );

  const rawPayload = response.Payload ? new TextDecoder().decode(response.Payload) : '{}';

  if (response.FunctionError) {
    const errorPayload = JSON.parse(rawPayload) as { errorMessage?: string; errorType?: string };
    throw new Error(
      `Lambda ${functionName} errored (${errorPayload.errorType}): ${errorPayload.errorMessage}`,
    );
  }

  const logResult = response.LogResult
    ? Buffer.from(response.LogResult, 'base64').toString('utf-8')
    : undefined;

  return {
    statusCode: response.StatusCode ?? 200,
    payload: JSON.parse(rawPayload) as T,
    logResult,
  };
}
