import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

export const getStage = (): string => process.env.STAGE ?? 'production';
export const getRegion = (): string => process.env.AWS_DEFAULT_REGION ?? 'us-east-1';

export function resourceNames(stage: string) {
  return {
    watchlistTable: `${stage}-watchlist`,
    ivHistoryTable: `${stage}-iv-history`,
    reportsTable: `${stage}-reports`,
    humanContextTable: `${stage}-human-context`,
    stateMachineName: `${stage}-options-analysis`,
    fetchMarketContextFn: `${stage}-fetch-market-context`,
    fetchOptionsDataFn: `${stage}-fetch-options-data`,
    fetchFundamentalsFn: `${stage}-fetch-fundamentals`,
    fetchTechnicalsFn: `${stage}-fetch-technicals`,
    enrichAndScoreFn: `${stage}-enrich-and-score`,
    runLlmAnalysisFn: `${stage}-run-llm-analysis`,
    generateReportFn: `${stage}-generate-report`,
    deliverReportFn: `${stage}-deliver-report`,
  };
}

let cachedBucketName: string | undefined;

export async function getBucketName(stage: string, region: string): Promise<string> {
  if (cachedBucketName) return cachedBucketName;
  const sts = new STSClient({ region });
  const { Account } = await sts.send(new GetCallerIdentityCommand({}));
  cachedBucketName = `options-analysis-${Account}-${region}-${stage}`;
  return cachedBucketName;
}
