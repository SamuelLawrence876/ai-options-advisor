import { Duration } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';
import { addStagePrefix } from '../../utils/naming';

export interface FetchFundamentalsProps {
  stage: string;
  bucket: IBucket;
  watchlistTable: ITable;
  alphaVantageApiKey: ISecret;
}

export class FetchFundamentals extends Construct {
  public readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: FetchFundamentalsProps) {
    super(scope, id);

    const { stage, bucket, watchlistTable, alphaVantageApiKey } = props;

    this.fn = new NodejsFunction(this, 'Function', {
      functionName: addStagePrefix(stage, 'fetch-fundamentals'),
      description:
        'Fetches earnings dates, dividends, analyst ratings, and short interest per ticker from Alpha Vantage and stores raw JSON to S3',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      entry: path.join(__dirname, '../../../../../src/functions/fetchFundamentals/index.ts'),
      handler: 'handler',
      timeout: Duration.minutes(1),
      memorySize: 256,
      environment: {
        SERVICE_NAME: addStagePrefix(stage, 'fetch-fundamentals'),
        STAGE: stage,
        BUCKET_NAME: bucket.bucketName,
        WATCHLIST_TABLE: watchlistTable.tableName,
        ALPHA_VANTAGE_SECRET_ARN: alphaVantageApiKey.secretArn,
      },
      bundling: { minify: true, sourceMap: true },
    });

    bucket.grantReadWrite(this.fn);
    watchlistTable.grantReadData(this.fn);
    alphaVantageApiKey.grantRead(this.fn);
  }
}
