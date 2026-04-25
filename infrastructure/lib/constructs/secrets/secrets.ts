import { ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { config } from '../../config';

export interface SecretsProps {
  stage: string;
}

export class Secrets extends Construct {
  public readonly marketDataApiToken: ISecret;

  public readonly finnhubApiKey: ISecret;

  public readonly polygonApiKey: ISecret;

  public readonly discordWebhookUrl: ISecret;

  constructor(scope: Construct, id: string, props: SecretsProps) {
    super(scope, id);

    const { stage } = props;

    this.marketDataApiToken = Secret.fromSecretNameV2(
      this,
      'MarketDataApiToken',
      config.secrets.marketDataApiToken(stage),
    );

    this.finnhubApiKey = Secret.fromSecretNameV2(
      this,
      'FinnhubApiKey',
      config.secrets.finnhubApiKey(stage),
    );

    this.polygonApiKey = Secret.fromSecretNameV2(
      this,
      'PolygonApiKey',
      config.secrets.polygonApiKey(stage),
    );

    this.discordWebhookUrl = Secret.fromSecretNameV2(
      this,
      'DiscordWebhookUrl',
      config.secrets.discordWebhookUrl(stage),
    );
  }
}
