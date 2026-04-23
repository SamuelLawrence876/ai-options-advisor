import { MarketContext, OhlcvBar, TechnicalsData, WatchlistItem } from '../../types';
import { error, info } from '../../utils/logger';
import { computeAtr, computeMovingAverage, classifyTrend } from '../../utils/metrics';
import { putJson } from '../../utils/s3';
import { getSecretValue } from '../../utils/secrets';

interface FetchTechnicalsEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

async function fetchDailyOhlcv(symbol: string, apiKey: string): Promise<OhlcvBar[]> {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=full&apikey=${apiKey}`;
  const response = await fetch(url);
  const data = (await response.json()) as Record<string, unknown>;
  const series = data['Time Series (Daily)'] as
    | Record<string, Record<string, string>>
    | undefined;

  if (!series) throw new Error(`No daily data for ${symbol}: ${JSON.stringify(data)}`);

  const bars = Object.entries(series)
    .map(([barDate, bar]) => ({
      date: barDate,
      open: parseFloat(bar['1. open']),
      high: parseFloat(bar['2. high']),
      low: parseFloat(bar['3. low']),
      close: parseFloat(bar['5. adjusted close']),
      volume: parseFloat(bar['6. volume']),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return bars.slice(-252);
}

export const handler = async (event: FetchTechnicalsEvent): Promise<FetchTechnicalsEvent> => {
  const bucketName = process.env.BUCKET_NAME!;
  const alphaVantageArn = process.env.ALPHA_VANTAGE_SECRET_ARN!;

  const { ticker, date } = event;
  const symbol = ticker.symbol;

  info('fetch-technicals started', { symbol, date });

  const apiKey = await getSecretValue(alphaVantageArn);

  let bars: OhlcvBar[];
  try {
    bars = await fetchDailyOhlcv(symbol, apiKey);
  } catch (err) {
    error(`Daily OHLCV fetch failed for ${symbol}`, err as Error);
    throw err;
  }

  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1] ?? 0;
  const ma20 = computeMovingAverage(closes, 20);
  const ma50 = computeMovingAverage(closes, 50);
  const trend = classifyTrend(price, ma20, ma50);
  const atr14 = computeAtr(bars, 14);
  const atrPct = price > 0 ? (atr14 / price) * 100 : 0;

  const high52w = Math.max(...closes.slice(-252));
  const low52w = Math.min(...closes.slice(-252));
  const distanceFromHigh52wPct = high52w > 0 ? ((high52w - price) / high52w) * 100 : 0;

  const priceVsMa20Pct = ma20 > 0 ? ((price - ma20) / ma20) * 100 : 0;
  const priceVsMa50Pct = ma50 > 0 ? ((price - ma50) / ma50) * 100 : 0;

  const technicals: TechnicalsData = {
    symbol,
    price,
    high52w,
    low52w,
    distanceFromHigh52wPct,
    ma20,
    ma50,
    trend,
    atr14,
    atrPct,
    priceVsMa20Pct,
    priceVsMa50Pct,
    fetchedAt: new Date().toISOString(),
  };

  await putJson(bucketName, `raw-data/${date}/${symbol}/technicals.json`, technicals);

  info('fetch-technicals complete', { symbol, date, price, trend });

  return event;
};
