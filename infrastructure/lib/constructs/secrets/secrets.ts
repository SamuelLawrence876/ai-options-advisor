import { ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { config } from '../../config';

export interface SecretsProps {
  stage: string;
}

export class Secrets extends Construct {
  public readonly flashAlphaApiKey: ISecret;

  public readonly finnhubApiKey: ISecret;

  constructor(scope: Construct, id: string, props: SecretsProps) {
    super(scope, id);

    const { stage } = props;

    this.flashAlphaApiKey = Secret.fromSecretNameV2(
      this,
      'FlashAlphaApiKey',
      config.secrets.flashAlphaApiKey(stage),
    );

    this.finnhubApiKey = Secret.fromSecretNameV2(
      this,
      'FinnhubApiKey',
      config.secrets.finnhubApiKey(stage),
    );
  }
}
