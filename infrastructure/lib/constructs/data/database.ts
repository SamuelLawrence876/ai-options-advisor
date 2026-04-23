import { RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { addStagePrefix } from '../../utils/naming';

export interface DatabaseProps {
  stage: string;
  isProd: boolean;
}

export class Database extends Construct {
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const { stage, isProd } = props;

    this.table = new Table(this, 'Table', {
      tableName: addStagePrefix(stage, 'items'),
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
  }
}
