import { Duration, Stack } from 'aws-cdk-lib';
import { FoundationModelIdentifier } from 'aws-cdk-lib/aws-bedrock';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';
import { addStagePrefix } from '../../utils/naming';

const BEDROCK_MODEL_ID = `us.${FoundationModelIdentifier.ANTHROPIC_CLAUDE_SONNET_4_20250514_V1_0.modelId}`;

export interface RunLlmAnalysisProps {
  stage: string;
  bucket: IBucket;
  watchlistTable: ITable;
  humanContextTable: ITable;
}

export class RunLlmAnalysis extends Construct {
  public readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: RunLlmAnalysisProps) {
    super(scope, id);

    const { stage, bucket, watchlistTable, humanContextTable } = props;

    this.fn = new NodejsFunction(this, 'Function', {
      functionName: addStagePrefix(stage, 'run-llm-analysis'),
      description:
        'Invokes Claude via Bedrock for per-ticker analysis (Stage 1) and portfolio-level synthesis ranked by ROBP (Stage 2); reads prompts from S3',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      entry: path.join(__dirname, '../../../../src/functions/runLlmAnalysis/index.ts'),
      handler: 'handler',
      timeout: Duration.minutes(5),
      memorySize: 512,
      environment: {
        SERVICE_NAME: addStagePrefix(stage, 'run-llm-analysis'),
        STAGE: stage,
        BUCKET_NAME: bucket.bucketName,
        WATCHLIST_TABLE: watchlistTable.tableName,
        HUMAN_CONTEXT_TABLE: humanContextTable.tableName,
        BEDROCK_MODEL_ID,
      },
      bundling: { minify: true, sourceMap: true },
    });

    bucket.grantReadWrite(this.fn);
    watchlistTable.grantReadData(this.fn);
    humanContextTable.grantReadData(this.fn);

    this.fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:*::foundation-model/anthropic.claude-*`,
          `arn:aws:bedrock:*:${Stack.of(this).account}:inference-profile/us.anthropic.claude-*`,
        ],
      }),
    );
  }
}
