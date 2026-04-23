import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  HttpVersion,
  PriceClass,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { config } from '../../config';
import { addStagePrefix } from '../../utils/naming';

export interface FrontendProps {
  stage: string;
  isProd: boolean;
}

export class Frontend extends Construct {
  public readonly bucket: Bucket;
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: FrontendProps) {
    super(scope, id);

    const { stage, isProd } = props;

    const subdomain = isProd ? config.domain.app : `dev-${config.domain.app}`;
    const fqdn = `${subdomain}.${config.domain.root}`;

    const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: config.domain.root,
    });

    const certificate = new Certificate(this, 'Certificate', {
      domainName: fqdn,
      validation: CertificateValidation.fromDns(hostedZone),
    });

    this.bucket = new Bucket(this, 'Bucket', {
      bucketName: `${config.stackName}-${addStagePrefix(stage, 'frontend')}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: addStagePrefix(stage, 'frontend'),
      domainNames: [fqdn],
      certificate,
      defaultRootObject: 'index.html',
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: isProd ? PriceClass.PRICE_CLASS_ALL : PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
      ],
    });

    new ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: subdomain,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

    new CfnOutput(scope, 'FrontendUrl', {
      value: `https://${fqdn}`,
      description: 'Frontend URL',
    });

    new CfnOutput(scope, 'FrontendBucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket for frontend assets',
    });

    new CfnOutput(scope, 'FrontendDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID (for cache invalidation)',
    });
  }
}
