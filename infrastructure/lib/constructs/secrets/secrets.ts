import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { config } from '../../config';

export interface SecretsProps {
  stage: string;
}

export class Secrets extends Construct {
  public readonly flashAlphaApiKey: Secret;

  public readonly alphaVantageApiKey: Secret;

  public readonly finnhubApiKey: Secret;

  constructor(scope: Construct, id: string, props: SecretsProps) {
    super(scope, id);

    const { stage } = props;

    this.flashAlphaApiKey = new Secret(this, 'FlashAlphaApiKey', {
      secretName: config.secrets.flashAlphaApiKey(stage),
      description: 'FlashAlpha API key for options data',
    });

    this.alphaVantageApiKey = new Secret(this, 'AlphaVantageApiKey', {
      secretName: config.secrets.alphaVantageApiKey(stage),
      description: 'Alpha Vantage API key for fundamentals data',
    });

    this.finnhubApiKey = new Secret(this, 'FinnhubApiKey', {
      secretName: config.secrets.finnhubApiKey(stage),
      description: 'Finnhub API key for OHLCV, quotes, and earnings calendar',
    });
  }
}
