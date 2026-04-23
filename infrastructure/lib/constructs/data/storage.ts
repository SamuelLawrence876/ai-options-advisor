import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface StorageProps {
  stage: string;
  isProd: boolean;
}

export class Storage extends Construct {
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: StorageProps) {
    super(scope, id);

    const { stage, isProd } = props;
    const { account, region } = Stack.of(this);

    this.bucket = new Bucket(this, 'Bucket', {
      bucketName: `options-analysis-${account}-${region}-${stage}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
      lifecycleRules: [
        {
          id: 'expire-raw-data',
          prefix: 'raw-data/',
          expiration: Duration.days(isProd ? 90 : 14),
        },
      ],
    });
  }
}
