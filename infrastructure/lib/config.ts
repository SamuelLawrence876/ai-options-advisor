export const config = {
  stackName: 'options-advisor',
  deploymentRegion: 'us-east-1',

  secrets: {
    flashAlphaApiKey: (stage: string) => `/options-advisor/${stage}/flash-alpha-api-key`,
    marketDataApiToken: (stage: string) => `/options-advisor/${stage}/market-data-api-token`,
    finnhubApiKey: (stage: string) => `/options-advisor/${stage}/finnhub-api-key`,
    polygonApiKey: (stage: string) => `/options-advisor/${stage}/polygon-api-key`,
  },

  email: {
    senderEmail: 'samuel_lawrence@outlook.com',
    recipientEmail: 'samuel_lawrence@outlook.com',
  },
} as const;
