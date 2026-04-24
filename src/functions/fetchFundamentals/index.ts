import { FundamentalsData, MarketContext, WatchlistItem } from '../../types';
import { error, info } from '../../utils/logger';
import { getJson, putJson } from '../../utils/aws/s3';
import { getSecretValue } from '../../utils/aws/secrets';
import { daysBetween, fetchAnalystRatings, fetchCompanyOverview } from './alphaVantage';

interface FetchFundamentalsEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

export const handler = async (event: FetchFundamentalsEvent): Promise<FetchFundamentalsEvent> => {
  const bucketName = process.env.BUCKET_NAME!;
  const alphaVantageArn = process.env.ALPHA_VANTAGE_SECRET_ARN!;

  const { ticker, date } = event;
  const symbol = ticker.symbol;

  info('fetch-fundamentals started', { symbol, date });

  const [apiKey, earningsCalendar] = await Promise.all([
    getSecretValue(alphaVantageArn),
    getJson<Record<string, string>>(
      bucketName,
      `raw-data/${date}/earnings-calendar.json`,
    ).catch(err => {
      error('Failed to read earnings calendar from S3', err as Error);
      return {} as Record<string, string>;
    }),
  ]);

  const earningsDate = earningsCalendar[symbol];
  const earningsDte = earningsDate ? daysBetween(earningsDate) : undefined;

  const [overview, ratings] = await Promise.all([
    fetchCompanyOverview(symbol, apiKey).catch(err => {
      error(`Company overview failed for ${symbol}`, err as Error);
      return undefined;
    }),
    fetchAnalystRatings(symbol, apiKey).catch(() => undefined),
  ]);

  const exDivDate = overview?.ExDividendDate;
  const exDivDte = exDivDate && exDivDate !== 'None' ? daysBetween(exDivDate) : undefined;
  const annualDividendYield = overview?.DividendYield
    ? parseFloat(overview.DividendYield) * 100
    : undefined;

  const meanPriceTarget = overview?.AnalystTargetPrice
    ? parseFloat(overview.AnalystTargetPrice)
    : undefined;

  const buyCount =
    parseInt(ratings?.analystRatingsBuy ?? ratings?.buy ?? '0', 10) +
    parseInt(ratings?.analystRatingsStrongBuy ?? ratings?.strongBuy ?? '0', 10);
  const sellCount =
    parseInt(ratings?.analystRatingsSell ?? ratings?.sell ?? '0', 10) +
    parseInt(ratings?.analystRatingsStrongSell ?? ratings?.strongSell ?? '0', 10);
  const holdCount = parseInt(ratings?.analystRatingsHold ?? ratings?.hold ?? '0', 10);
  const totalAnalysts = buyCount + sellCount + holdCount;
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
    exDivDate: exDivDate !== 'None' ? exDivDate : undefined,
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
