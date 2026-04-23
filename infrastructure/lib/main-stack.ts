import { Stack, StackProps } from 'aws-cdk-lib';
import { IHttpRouteAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { config } from './config';
import { ApiGateway } from './constructs/api/api-gateway';
import { Auth } from './constructs/auth/auth';
import { RequestHandler } from './constructs/lambda/request-handler';
import { Database } from './constructs/data/database';
import { Storage } from './constructs/data/storage';
import { Frontend } from './constructs/frontend/frontend';

export type StackType = 'prod' | 'dev' | 'ephemeral';

export interface ServerlessStackProps extends StackProps {
  stackType: StackType;
  stage: string;
}

export class ServerlessStack extends Stack {
  constructor(scope: Construct, id: string, props: ServerlessStackProps) {
    super(scope, id, props);

    const { stackType, stage } = props;
    const isProd = stackType === 'prod';

    const database = new Database(this, 'Database', { stage, isProd });
    const storage = new Storage(this, 'Storage', { stage, isProd });

    const requestHandler = new RequestHandler(this, 'RequestHandler', {
      stage,
      table: database.table,
      bucket: storage.bucket,
    });

    let authorizer: IHttpRouteAuthorizer;

    if (stackType === 'ephemeral') {
      const issuerUrl = StringParameter.valueForStringParameter(this, config.ssm.cognitoIssuerUrl('dev'));
      const clientId = StringParameter.valueForStringParameter(this, config.ssm.cognitoClientId('dev'));
      authorizer = new HttpJwtAuthorizer('JwtAuthorizer', issuerUrl, {
        jwtAudience: [clientId],
      });
    } else {
      const auth = new Auth(this, 'Auth', { stage, isProd });
      authorizer = auth.authorizer;
      new Frontend(this, 'Frontend', { stage, isProd });
    }

    new ApiGateway(this, 'Api', { handler: requestHandler.fn, stage, isProd, authorizer });
  }
}
