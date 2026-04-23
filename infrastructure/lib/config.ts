export const config = {
  stackName: 'options-advisor',
  deploymentRegion: 'us-east-1',

  secrets: {
    flashAlphaApiKey: (stage: string) => `/options-advisor/${stage}/flash-alpha-api-key`,
    alphaVantageApiKey: (stage: string) => `/options-advisor/${stage}/alpha-vantage-api-key`,
  },
} as const;
