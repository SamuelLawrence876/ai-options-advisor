import { FundamentalsData, MarketContext, WatchlistItem } from '../../types';
import { error, info } from '../../utils/logger';
import { getJson, putJson } from '../../utils/aws/s3';
import { getSecretValue } from '../../utils/aws/secrets';
import {
  fetchFinnhubDividendYield,
  fetchFinnhubPriceTarget,
  fetchFinnhubRecommendations,
  fetchFinnhubUpcomingDividend,
} from '../../utils/clients/finnhub';

interface FetchFundamentalsEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

function daysBetween(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function dateOffsetDays(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const handler = async (event: FetchFundamentalsEvent): Promise<FetchFundamentalsEvent> => {
  const bucketName = process.env.BUCKET_NAME!;
  const finnhubArn = process.env.FINNHUB_SECRET_ARN!;

  const { ticker, date } = event;
  const symbol = ticker.symbol;

  info('fetch-fundamentals started', { symbol, date });

  const [finnhubKey, earningsCalendar] = await Promise.all([
    getSecretValue(finnhubArn),
    getJson<Record<string, string>>(bucketName, `raw-data/${date}/earnings-calendar.json`).catch(
      err => {
        error('Failed to read earnings calendar from S3', err as Error);
        return {} as Record<string, string>;
      },
    ),
  ]);

  const earningsDate = earningsCalendar[symbol];
  const earningsDte = earningsDate ? daysBetween(earningsDate) : undefined;

  const divFrom = date;
  const divTo = dateOffsetDays(date, 90);

  const [exDivDate, annualDividendYield, meanPriceTarget, ratings] = await Promise.all([
    fetchFinnhubUpcomingDividend(symbol, divFrom, divTo, finnhubKey).catch(() => undefined),
    fetchFinnhubDividendYield(symbol, finnhubKey).catch(() => undefined),
    fetchFinnhubPriceTarget(symbol, finnhubKey).catch(() => undefined),
    fetchFinnhubRecommendations(symbol, finnhubKey).catch(() => ({
      buyCount: 0,
      holdCount: 0,
      sellCount: 0,
    })),
  ]);

  const exDivDte = exDivDate ? daysBetween(exDivDate) : undefined;

  const { buyCount, holdCount, sellCount } = ratings;
  const totalAnalysts = buyCount + holdCount + sellCount;
  const analystConsensus =
    totalAnalysts === 0
      ? 'N/A'
      : buyCount > sellCount + holdCount
        ? 'Buy'
        : sellCount > buyCount + holdCount
          ? 'Sell'
          : 'Hold';

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
