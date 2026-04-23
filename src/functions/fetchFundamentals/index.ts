import { FundamentalsData, MarketContext, WatchlistItem } from '../../types';
import { error, info } from '../../utils/logger';
import { putJson } from '../../utils/s3';
import { getSecretValue } from '../../utils/secrets';

interface FetchFundamentalsEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

interface AlphaVantageEarningsCalendar {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: string;
  currency: string;
}

interface AlphaVantageAnalystRatings {
  symbol: string;
  targetPrice?: string;
  strongBuy?: string;
  buy?: string;
  hold?: string;
  sell?: string;
  strongSell?: string;
  analystRatingsBuy?: string;
  analystRatingsSell?: string;
  analystRatingsHold?: string;
  analystRatingsStrongSell?: string;
  analystRatingsStrongBuy?: string;
}

interface AlphaVantageOverview {
  Symbol: string;
  DividendDate?: string;
  ExDividendDate?: string;
  DividendYield?: string;
  ForwardPE?: string;
  AnalystTargetPrice?: string;
  '52WeekHigh'?: string;
  '52WeekLow'?: string;
}

function daysBetween(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

async function fetchEarningsCalendar(
  symbol: string,
  apiKey: string,
): Promise<AlphaVantageEarningsCalendar | undefined> {
  const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${symbol}&horizon=3month&apikey=${apiKey}`;
  const response = await fetch(url);
  const text = await response.text();
  const lines = text.trim().split('\n').slice(1);
  for (const line of lines) {
    const parts = line.split(',');
    if (parts[0] === symbol && parts.length >= 4) {
      return {
        symbol: parts[0],
        name: parts[1],
        reportDate: parts[2],
        fiscalDateEnding: parts[3],
        estimate: parts[4] ?? '',
        currency: parts[5] ?? 'USD',
      };
    }
  }
  return undefined;
}

async function fetchCompanyOverview(
  symbol: string,
  apiKey: string,
): Promise<AlphaVantageOverview> {
  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;
  const response = await fetch(url);
  return response.json() as Promise<AlphaVantageOverview>;
}

async function fetchAnalystRatings(
  symbol: string,
  apiKey: string,
): Promise<AlphaVantageAnalystRatings | undefined> {
  const url = `https://www.alphavantage.co/query?function=ANALYTICS_FIXED_WINDOW&SYMBOLS=${symbol}&RANGE=1month&INTERVAL=WEEKLY&OHLC=close&CALCULATIONS=MEAN,STDDEV&apikey=${apiKey}`;
  try {
    const response = await fetch(url);
    return response.json() as Promise<AlphaVantageAnalystRatings>;
  } catch {
    return undefined;
  }
}

export const handler = async (event: FetchFundamentalsEvent): Promise<FetchFundamentalsEvent> => {
  const bucketName = process.env.BUCKET_NAME!;
  const alphaVantageArn = process.env.ALPHA_VANTAGE_SECRET_ARN!;

  const { ticker, date } = event;
  const symbol = ticker.symbol;

  info('fetch-fundamentals started', { symbol, date });

  const apiKey = await getSecretValue(alphaVantageArn);

  const [earningsEntry, overview] = await Promise.all([
    fetchEarningsCalendar(symbol, apiKey).catch((err) => {
      error(`Earnings calendar failed for ${symbol}`, err as Error);
      return undefined;
    }),
    fetchCompanyOverview(symbol, apiKey).catch((err) => {
      error(`Company overview failed for ${symbol}`, err as Error);
      return undefined as unknown as AlphaVantageOverview;
    }),
    fetchAnalystRatings(symbol, apiKey).catch(() => undefined),
  ]);

  const earningsDate = earningsEntry?.reportDate;
  const earningsDte = earningsDate ? daysBetween(earningsDate) : undefined;

  const exDivDate = overview?.ExDividendDate;
  const exDivDte = exDivDate && exDivDate !== 'None' ? daysBetween(exDivDate) : undefined;
  const annualDividendYield = overview?.DividendYield
    ? parseFloat(overview.DividendYield) * 100
    : undefined;

  const meanPriceTarget = overview?.AnalystTargetPrice
    ? parseFloat(overview.AnalystTargetPrice)
    : undefined;

  const fundamentals: FundamentalsData = {
    symbol,
    earningsDate,
    earningsDte,
    exDivDate: exDivDate !== 'None' ? exDivDate : undefined,
    exDivDte,
    annualDividendYield,
    meanPriceTarget,
    analystConsensus: 'N/A',
    unusualActivityFlag: false,
    fetchedAt: new Date().toISOString(),
  };

  await putJson(bucketName, `raw-data/${date}/${symbol}/fundamentals.json`, fundamentals);

  info('fetch-fundamentals complete', { symbol, date, earningsDate });

  return event;
};
