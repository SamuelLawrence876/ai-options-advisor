import { FundamentalsData, MarketContext, WatchlistItem } from '../../types';
import { error, info } from '../../utils/logger';
import { getJson, putJson } from '../../utils/aws/s3Json';
import { getSecretValue } from '../../utils/aws/secrets';
import {
  fetchFinnhubPriceTarget,
  fetchFinnhubRecommendations,
} from '../../utils/clients/finnhubAnalystInsights';
import {
  fetchFinnhubDividendYield,
  fetchFinnhubUpcomingDividend,
} from '../../utils/clients/finnhubDividends';
import { daysBetween, dateOffsetDays, resolveApiDate } from '../../utils/dates';
import { deriveAnalystConsensus } from './analystConsensus';

interface FetchFundamentalsEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

export const handler = async (event: FetchFundamentalsEvent): Promise<FetchFundamentalsEvent> => {
  const bucketName = process.env.BUCKET_NAME!;
  const finnhubArn = process.env.FINNHUB_SECRET_ARN!;

  const { ticker, date } = event;
  const symbol = ticker.symbol;
  const apiDate = resolveApiDate(date);

  info('fetch-fundamentals started', { symbol, date });

  const [finnhubKey, earningsCalendar] = await Promise.all([
    getSecretValue(finnhubArn),
    getJson<Record<string, string>>(bucketName, `raw-data/${apiDate}/earnings-calendar.json`).catch(
      err => {
        error('Failed to read earnings calendar from S3', err as Error);
        return {} as Record<string, string>;
      },
    ),
  ]);

  const earningsDate = earningsCalendar[symbol];
  const earningsDte = earningsDate ? daysBetween(earningsDate, apiDate) : undefined;

  const [exDivDate, annualDividendYield, meanPriceTarget, ratings] = await Promise.all([
    fetchFinnhubUpcomingDividend(symbol, apiDate, dateOffsetDays(apiDate, 90), finnhubKey).catch(
      () => undefined,
    ),
    fetchFinnhubDividendYield(symbol, finnhubKey).catch(() => undefined),
    fetchFinnhubPriceTarget(symbol, finnhubKey).catch(() => undefined),
    fetchFinnhubRecommendations(symbol, finnhubKey).catch(() => ({
      buyCount: 0,
      holdCount: 0,
      sellCount: 0,
    })),
  ]);

  const exDivDte = exDivDate ? daysBetween(exDivDate, apiDate) : undefined;
  const analystConsensus = deriveAnalystConsensus(
    ratings.buyCount,
    ratings.holdCount,
    ratings.sellCount,
  );

  const fundamentals: FundamentalsData = {
    symbol,
    earningsDate,
    earningsDte,
    exDivDate,
    exDivDte,
    annualDividendYield,
    meanPriceTarget,
    analystConsensus,
    unusualActivityFlag: false,
    fetchedAt: new Date().toISOString(),
  };

  await putJson(bucketName, `raw-data/${date}/${symbol}/fundamentals.json`, fundamentals);

  info('fetch-fundamentals complete', { symbol, date, earningsDate });

  return event;
};
