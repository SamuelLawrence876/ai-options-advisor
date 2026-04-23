export const config = {
  stackName: 'serverless-starter',
  deploymentRegion: 'us-east-1',

  domain: {
    root: 'samuel-lawrence.com',
    api: 'example-api',
    app: 'example-app',
    auth: 'serverless-starter-auth',
  },

  ssm: {
    cognitoIssuerUrl: (stage: string) => `/serverless-starter/${stage}/cognito/issuer-url`,
    cognitoClientId: (stage: string) => `/serverless-starter/${stage}/cognito/client-id`,
  },
} as const;
