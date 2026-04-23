import { Duration } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';
import { addStagePrefix } from '../../utils/naming';

export interface EnrichAndScoreProps {
  stage: string;
  bucket: IBucket;
  watchlistTable: ITable;
  humanContextTable: ITable;
}

export class EnrichAndScore extends Construct {
  public readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: EnrichAndScoreProps) {
    super(scope, id);

    const { stage, bucket, watchlistTable, humanContextTable } = props;

    this.fn = new NodejsFunction(this, 'Function', {
      functionName: addStagePrefix(stage, 'enrich-and-score'),
      description:
        'Combines raw S3 data per ticker into a structured LLM-ready signal object: vol signals, event flags, candidate strikes, and ROBP metrics',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      entry: path.join(__dirname, '../../../../src/functions/enrichAndScore/index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        SERVICE_NAME: addStagePrefix(stage, 'enrich-and-score'),
        STAGE: stage,
        BUCKET_NAME: bucket.bucketName,
        WATCHLIST_TABLE: watchlistTable.tableName,
        HUMAN_CONTEXT_TABLE: humanContextTable.tableName,
      },
      bundling: { minify: true, sourceMap: true },
    });

    bucket.grantReadWrite(this.fn);
    watchlistTable.grantReadData(this.fn);
    humanContextTable.grantReadData(this.fn);
  }
}
