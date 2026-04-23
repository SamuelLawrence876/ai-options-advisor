import {
  DescribeExecutionCommand,
  ExecutionStatus,
  ListStateMachinesCommand,
  SFNClient,
  StartExecutionCommand,
  StateMachineListItem,
} from '@aws-sdk/client-sfn';

const sfn = new SFNClient({});

export async function getStateMachineArn(name: string): Promise<string> {
  const result = await sfn.send(new ListStateMachinesCommand({}));
  const match = result.stateMachines?.find((sm: StateMachineListItem) => sm.name === name);
  if (!match?.stateMachineArn) throw new Error(`State machine '${name}' not found`);
  return match.stateMachineArn;
}

export async function startExecution(
  stateMachineArn: string,
  input: Record<string, unknown>,
  name?: string,
): Promise<string> {
  const execName =
    name ??
    `acceptance-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const result = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn,
      name: execName,
      input: JSON.stringify(input),
    }),
  );
  if (!result.executionArn) throw new Error('No executionArn returned');
  return result.executionArn;
}

export async function getExecutionStatus(executionArn: string): Promise<{
  status: ExecutionStatus;
  cause?: string;
  output?: string;
}> {
  const result = await sfn.send(new DescribeExecutionCommand({ executionArn }));
  return {
    status: result.status as ExecutionStatus,
    cause: result.cause,
    output: result.output,
  };
}

export async function pollExecution(
  executionArn: string,
  timeoutMs: number,
  pollIntervalMs = 15000,
): Promise<{ status: ExecutionStatus; output?: string }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { status, cause, output } = await getExecutionStatus(executionArn);

    if (status === 'SUCCEEDED') return { status, output };
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED_OUT') {
      throw new Error(`Execution ${status}: ${cause ?? 'no cause'}`);
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`Execution did not complete within ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
