import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { SfnStateMachine } from 'aws-cdk-lib/aws-events-targets';
import { IStateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { addStagePrefix } from '../../utils/naming';

export interface SchedulerProps {
  stage: string;
  stateMachine: IStateMachine;
}

export class Scheduler extends Construct {
  constructor(scope: Construct, id: string, props: SchedulerProps) {
    super(scope, id);

    const { stage, stateMachine } = props;

    new Rule(this, 'WeekdaySchedule', {
      ruleName: addStagePrefix(stage, 'options-analysis-weekday'),
      description: 'Triggers the options analysis pipeline Monday-Friday at 06:00 UTC',
      schedule: Schedule.cron({ minute: '0', hour: '6', weekDay: 'MON-FRI' }),
      targets: [new SfnStateMachine(stateMachine)],
    });
  }
}
