import { Duration } from 'aws-cdk-lib';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';
import { addStagePrefix } from '../../utils/naming';

export interface GenerateReportProps {
  stage: string;
  bucket: IBucket;
}

export class GenerateReport extends Construct {
  public readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: GenerateReportProps) {
    super(scope, id);

    const { stage, bucket } = props;

    this.fn = new NodejsFunction(this, 'Function', {
      functionName: addStagePrefix(stage, 'generate-report'),
      description:
        'Renders the portfolio synthesis JSON into a formatted HTML report with a market regime banner, top opportunities ranked by ROBP, and full watchlist review',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      entry: path.join(__dirname, '../../../../../src/functions/generateReport/index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        SERVICE_NAME: addStagePrefix(stage, 'generate-report'),
        STAGE: stage,
        BUCKET_NAME: bucket.bucketName,
      },
      bundling: { minify: true, sourceMap: true },
    });

    bucket.grantReadWrite(this.fn);
  }
}
