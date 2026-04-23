import { Duration } from 'aws-cdk-lib';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Chain, DefinitionBody, Pass, StateMachine, Succeed } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { addStagePrefix } from '../../utils/naming';

export interface PipelineStateMachineProps {
  stage: string;
  isProd: boolean;
  fetchOptionsData: IFunction;
  fetchFundamentals: IFunction;
  fetchTechnicals: IFunction;
  fetchMarketContext: IFunction;
  enrichAndScore: IFunction;
  runLlmAnalysis: IFunction;
  generateReport: IFunction;
  deliverReport: IFunction;
}

export class PipelineStateMachine extends Construct {
  public readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: PipelineStateMachineProps) {
    super(scope, id);

    const { stage } = props;

    const placeholder = new Pass(this, 'Placeholder', {
      comment: 'Placeholder — full orchestration wired in Phase 6',
    });

    const succeed = new Succeed(this, 'Succeed');

    this.stateMachine = new StateMachine(this, 'StateMachine', {
      stateMachineName: addStagePrefix(stage, 'options-analysis'),
      definitionBody: DefinitionBody.fromChainable(Chain.start(placeholder).next(succeed)),
      timeout: Duration.hours(4),
    });
  }
}
