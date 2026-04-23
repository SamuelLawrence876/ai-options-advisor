import { RemovalPolicy } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { config } from '../../config';
import { addStagePrefix } from '../../utils/naming';

export interface StorageProps {
  stage: string;
  isProd: boolean;
}

export class Storage extends Construct {
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: StorageProps) {
    super(scope, id);

    const { stage, isProd } = props;

    this.bucket = new Bucket(this, 'Bucket', {
      bucketName: `${config.stackName}-${addStagePrefix(stage, 'storage')}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });
  }
}
