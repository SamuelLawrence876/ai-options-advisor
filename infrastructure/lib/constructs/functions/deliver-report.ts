import { Duration } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';
import { addStagePrefix } from '../../utils/naming';

export interface DeliverReportProps {
  stage: string;
  bucket: IBucket;
  reportsTable: ITable;
  ivHistoryTable: ITable;
  senderEmail: string;
  recipientEmail: string;
  discordWebhookUrl: ISecret;
}

export class DeliverReport extends Construct {
  public readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: DeliverReportProps) {
    super(scope, id);

    const {
      stage,
      bucket,
      reportsTable,
      ivHistoryTable,
      senderEmail,
      recipientEmail,
      discordWebhookUrl,
    } = props;

    this.fn = new NodejsFunction(this, 'Function', {
      functionName: addStagePrefix(stage, 'deliver-report'),
      description:
        'Stores the report to S3, generates a 7-day pre-signed URL, writes report metadata to DynamoDB, and delivers the report',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      entry: path.join(__dirname, '../../../../src/functions/deliverReport/index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        SERVICE_NAME: addStagePrefix(stage, 'deliver-report'),
        STAGE: stage,
        BUCKET_NAME: bucket.bucketName,
        REPORTS_TABLE: reportsTable.tableName,
        IV_HISTORY_TABLE: ivHistoryTable.tableName,
        SENDER_EMAIL: senderEmail,
        RECIPIENT_EMAIL: recipientEmail,
        DISCORD_WEBHOOK_SECRET_ARN: discordWebhookUrl.secretArn,
      },
      bundling: { minify: true, sourceMap: true },
    });

    bucket.grantReadWrite(this.fn);
    reportsTable.grantReadWriteData(this.fn);
    ivHistoryTable.grantReadWriteData(this.fn);
    discordWebhookUrl.grantRead(this.fn);

    this.fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      }),
    );
  }
}
