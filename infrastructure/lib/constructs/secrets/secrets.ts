import { RemovalPolicy, SecretValue } from 'aws-cdk-lib';
import { ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { config } from '../../config';

export interface SecretsProps {
  stage: string;
}

export class Secrets extends Construct {
  public readonly flashAlphaApiKey: ISecret;

  public readonly finnhubApiKey: ISecret;

  public readonly polygonApiKey: ISecret;

  constructor(scope: Construct, id: string, props: SecretsProps) {
    super(scope, id);

    const { stage } = props;

    const flashAlphaValue: string = String(this.node.tryGetContext('flashAlphaApiKey') ?? 'placeholder');
    const finnhubValue: string = String(this.node.tryGetContext('finnhubApiKey') ?? 'placeholder');
    const polygonValue: string = String(this.node.tryGetContext('polygonApiKey') ?? 'placeholder');

    this.flashAlphaApiKey = new Secret(this, 'FlashAlphaApiKey', {
      secretName: config.secrets.flashAlphaApiKey(stage),
      secretStringValue: SecretValue.unsafePlainText(flashAlphaValue),
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.finnhubApiKey = new Secret(this, 'FinnhubApiKey', {
      secretName: config.secrets.finnhubApiKey(stage),
      secretStringValue: SecretValue.unsafePlainText(finnhubValue),
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.polygonApiKey = new Secret(this, 'PolygonApiKey', {
      secretName: config.secrets.polygonApiKey(stage),
      secretStringValue: SecretValue.unsafePlainText(polygonValue),
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
