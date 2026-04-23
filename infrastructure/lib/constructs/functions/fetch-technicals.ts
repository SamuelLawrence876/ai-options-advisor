import { Duration } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';
import { addStagePrefix } from '../../utils/naming';

export interface FetchTechnicalsProps {
  stage: string;
  bucket: IBucket;
  watchlistTable: ITable;
  alphaVantageApiKey: ISecret;
}

export class FetchTechnicals extends Construct {
  public readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: FetchTechnicalsProps) {
    super(scope, id);

    const { stage, bucket, watchlistTable, alphaVantageApiKey } = props;

    this.fn = new NodejsFunction(this, 'Function', {
      functionName: addStagePrefix(stage, 'fetch-technicals'),
      description:
        'Fetches 252-day price history per ticker from Alpha Vantage and computes technical signals: trend classification, 20/50d MAs, ATR, and 52-week range',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      entry: path.join(__dirname, '../../../../src/functions/fetchTechnicals/index.ts'),
      handler: 'handler',
      timeout: Duration.minutes(1),
      memorySize: 256,
      environment: {
        SERVICE_NAME: addStagePrefix(stage, 'fetch-technicals'),
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
