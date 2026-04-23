import { CfnOutput } from 'aws-cdk-lib';
import { DomainName, HttpApi, HttpMethod, IHttpRouteAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { ApiGatewayv2DomainProperties } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { config } from '../../config';
import { addStagePrefix } from '../../utils/naming';

export interface ApiGatewayProps {
  handler: IFunction;
  stage: string;
  isProd: boolean;
  authorizer: IHttpRouteAuthorizer;
}

export class ApiGateway extends Construct {
  public readonly api: HttpApi;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    const { handler, stage, isProd, authorizer } = props;
    const subdomain = isProd ? config.domain.api : `dev-${config.domain.api}`;
    const fqdn = `${subdomain}.${config.domain.root}`;

    const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: config.domain.root,
    });

    const certificate = new Certificate(this, 'Certificate', {
      domainName: fqdn,
      validation: CertificateValidation.fromDns(hostedZone),
    });

    const apiDomain = new DomainName(this, 'DomainName', {
      domainName: fqdn,
      certificate,
    });

    new ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: subdomain,
      target: RecordTarget.fromAlias(
        new ApiGatewayv2DomainProperties(
          apiDomain.regionalDomainName,
          apiDomain.regionalHostedZoneId,
        ),
      ),
    });

    this.api = new HttpApi(this, 'HttpApi', {
      apiName: addStagePrefix(stage, 'api'),
      defaultDomainMapping: { domainName: apiDomain },
      defaultAuthorizer: authorizer,
    });

    this.api.addRoutes({
      path: '/health',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('HealthIntegration', handler),
    });

    this.api.addRoutes({
      path: '/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ProxyIntegration', handler),
    });

    new CfnOutput(scope, 'ApiUrl', {
      value: `https://${fqdn}`,
      description: 'API endpoint',
    });
  }
}
