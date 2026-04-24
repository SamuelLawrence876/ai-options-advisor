import { Duration } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';
import { addStagePrefix } from '../../utils/naming';

export interface FetchMarketContextProps {
  stage: string;
  bucket: IBucket;
  watchlistTable: ITable;
  flashAlphaApiKey: ISecret;
  finnhubApiKey: ISecret;
}

export class FetchMarketContext extends Construct {
  public readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: FetchMarketContextProps) {
    super(scope, id);

    const { stage, bucket, watchlistTable, flashAlphaApiKey, finnhubApiKey } = props;

    this.fn = new NodejsFunction(this, 'Function', {
      functionName: addStagePrefix(stage, 'fetch-market-context'),
      description:
        'Fetches macro regime data once per pipeline run: VIX level and classification, SPY/QQQ trend, sector ETF IV, and earnings calendar',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      entry: path.join(__dirname, '../../../../src/functions/fetchMarketContext/index.ts'),
      handler: 'handler',
      timeout: Duration.minutes(1),
      memorySize: 256,
      environment: {
        SERVICE_NAME: addStagePrefix(stage, 'fetch-market-context'),
        STAGE: stage,
        BUCKET_NAME: bucket.bucketName,
        WATCHLIST_TABLE: watchlistTable.tableName,
        FLASH_ALPHA_SECRET_ARN: flashAlphaApiKey.secretArn,
        FINNHUB_SECRET_ARN: finnhubApiKey.secretArn,
      },
      bundling: { minify: true, sourceMap: true },
    });

    bucket.grantReadWrite(this.fn);
    watchlistTable.grantReadData(this.fn);
    flashAlphaApiKey.grantRead(this.fn);
    finnhubApiKey.grantRead(this.fn);
  }
}
