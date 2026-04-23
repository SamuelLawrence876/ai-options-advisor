import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import {
  AccountRecovery,
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolDomain,
  UserPoolEmail,
} from 'aws-cdk-lib/aws-cognito';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { config } from '../../config';
import { addStagePrefix } from '../../utils/naming';

export interface AuthProps {
  stage: string;
  isProd: boolean;
}

export class Auth extends Construct {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly authorizer: HttpJwtAuthorizer;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);

    const { stage, isProd } = props;

    const authSubdomain = isProd ? config.domain.auth : `dev-${config.domain.auth}`;

    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: addStagePrefix(stage, 'user-pool'),
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      email: UserPoolEmail.withCognito(),
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: Duration.days(7),
      },
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const cognitoDomain: UserPoolDomain = this.userPool.addDomain('HostedDomain', {
      cognitoDomain: { domainPrefix: authSubdomain },
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: addStagePrefix(stage, 'web-client'),
      authFlows: { userSrp: true },
      oAuth: {
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [cognitoDomain.baseUrl()],
        logoutUrls: [cognitoDomain.baseUrl()],
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    this.authorizer = new HttpJwtAuthorizer('JwtAuthorizer', this.userPool.userPoolProviderUrl, {
      authorizerName: addStagePrefix(stage, 'jwt-authorizer'),
      jwtAudience: [this.userPoolClient.userPoolClientId],
    });

    new StringParameter(this, 'IssuerUrlParam', {
      parameterName: config.ssm.cognitoIssuerUrl(stage),
      stringValue: this.userPool.userPoolProviderUrl,
    });

    new StringParameter(this, 'ClientIdParam', {
      parameterName: config.ssm.cognitoClientId(stage),
      stringValue: this.userPoolClient.userPoolClientId,
    });
  }
}
