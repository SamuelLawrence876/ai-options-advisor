import { RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { addStagePrefix } from '../../utils/naming';

export interface TablesProps {
  stage: string;
  isProd: boolean;
}

export class Tables extends Construct {
  public readonly watchlistTable: Table;

  public readonly ivHistoryTable: Table;

  public readonly reportsTable: Table;

  public readonly humanContextTable: Table;

  constructor(scope: Construct, id: string, props: TablesProps) {
    super(scope, id);

    const { stage, isProd } = props;
    const removalPolicy = isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    this.watchlistTable = new Table(this, 'WatchlistTable', {
      tableName: addStagePrefix(stage, 'watchlist'),
      partitionKey: { name: 'symbol', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });

    this.ivHistoryTable = new Table(this, 'IvHistoryTable', {
      tableName: addStagePrefix(stage, 'iv-history'),
      partitionKey: { name: 'symbol', type: AttributeType.STRING },
      sortKey: { name: 'date', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });

    this.reportsTable = new Table(this, 'ReportsTable', {
      tableName: addStagePrefix(stage, 'reports'),
      partitionKey: { name: 'reportDate', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });

    this.humanContextTable = new Table(this, 'HumanContextTable', {
      tableName: addStagePrefix(stage, 'human-context'),
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'timestamp', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
  }
}
