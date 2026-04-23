import { Duration } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';
import { addStagePrefix } from '../../utils/naming';

export interface FetchOptionsDataProps {
  stage: string;
  bucket: IBucket;
  watchlistTable: ITable;
  flashAlphaApiKey: ISecret;
}

export class FetchOptionsData extends Construct {
  public readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: FetchOptionsDataProps) {
    super(scope, id);

    const { stage, bucket, watchlistTable, flashAlphaApiKey } = props;

    this.fn = new NodejsFunction(this, 'Function', {
      functionName: addStagePrefix(stage, 'fetch-options-data'),
      description:
        'Fetches options data (IV rank, Greeks, vol surface, key levels) per ticker from FlashAlpha and stores raw JSON to S3',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      entry: path.join(__dirname, '../../../../src/functions/fetchOptionsData/index.ts'),
      handler: 'handler',
      timeout: Duration.minutes(1),
      memorySize: 256,
      environment: {
        SERVICE_NAME: addStagePrefix(stage, 'fetch-options-data'),
        STAGE: stage,
        BUCKET_NAME: bucket.bucketName,
        WATCHLIST_TABLE: watchlistTable.tableName,
        FLASH_ALPHA_SECRET_ARN: flashAlphaApiKey.secretArn,
      },
      bundling: { minify: true, sourceMap: true },
    });

    bucket.grantReadWrite(this.fn);
    watchlistTable.grantReadData(this.fn);
    flashAlphaApiKey.grantRead(this.fn);
  }
}
