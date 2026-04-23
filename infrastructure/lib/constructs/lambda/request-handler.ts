import { Duration } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import * as path from 'path';
import { addStagePrefix } from '../../utils/naming';

export interface RequestHandlerProps {
  stage: string;
  table: ITable;
  bucket: IBucket;
}

export class RequestHandler extends Construct {
  public readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: RequestHandlerProps) {
    super(scope, id);

    const { stage, table, bucket } = props;

    const dlq = new Queue(this, 'Dlq', {
      queueName: addStagePrefix(stage, 'request-handler-dlq'),
      retentionPeriod: Duration.days(14),
    });

    this.fn = new NodejsFunction(this, 'Function', {
      functionName: addStagePrefix(stage, 'request-handler'),
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      entry: path.join(__dirname, '../../../../src/functions/requestHandler/index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        SERVICE_NAME: addStagePrefix(stage, 'request-handler'),
        STAGE: stage,
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
      deadLetterQueue: dlq,
    });

    table.grantReadWriteData(this.fn);
    bucket.grantReadWrite(this.fn);
  }
}
