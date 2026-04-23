import { RemovalPolicy, Tags } from 'aws-cdk-lib';
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

    Tags.of(this.watchlistTable).add(
      'Description',
      'Universe of tickers to analyse each week; controls strategy preference, DTE range, and cost basis per position',
    );

    this.ivHistoryTable = new Table(this, 'IvHistoryTable', {
      tableName: addStagePrefix(stage, 'iv-history'),
      partitionKey: { name: 'symbol', type: AttributeType.STRING },
      sortKey: { name: 'date', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });

    Tags.of(this.ivHistoryTable).add(
      'Description',
      'Daily IV snapshots (IV rank, IV percentile, 30d HV, VRP) per ticker; used to build independent IV rank history',
    );

    this.reportsTable = new Table(this, 'ReportsTable', {
      tableName: addStagePrefix(stage, 'reports'),
      partitionKey: { name: 'reportDate', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });

    Tags.of(this.reportsTable).add(
      'Description',
      'Metadata index of every generated report; full HTML content lives in S3 at the s3_key attribute',
    );

    this.humanContextTable = new Table(this, 'HumanContextTable', {
      tableName: addStagePrefix(stage, 'human-context'),
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'timestamp', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });

    Tags.of(this.humanContextTable).add(
      'Description',
      'Optional human insights injected before a run; appended to the ticker dossier and treated as high-weight signal by the LLM',
    );
  }
}
