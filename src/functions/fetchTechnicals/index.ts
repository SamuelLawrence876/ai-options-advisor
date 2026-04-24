import { MarketContext, OhlcvBar, TechnicalsData, WatchlistItem } from '../../types';
import { error, info } from '../../utils/logger';
import { computeAtr, computeMovingAverage, classifyTrend } from '../../utils/metrics';
import { putJson } from '../../utils/s3';

interface FetchTechnicalsEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

interface YahooChartResponse {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: { quote: Array<{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }> };
    }>;
    error?: unknown;
  };
}

async function fetchDailyOhlcv(symbol: string): Promise<OhlcvBar[]> {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1y`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = (await response.json()) as YahooChartResponse;
  const result = data.chart.result?.[0];
  if (!result) throw new Error(`No Yahoo Finance data for ${symbol}: ${JSON.stringify(data.chart.error)}`);

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];

  return timestamp
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: quote.open[i] ?? 0,
      high: quote.high[i] ?? 0,
      low: quote.low[i] ?? 0,
      close: quote.close[i] ?? 0,
      volume: quote.volume[i] ?? 0,
    }))
    .filter((b) => b.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-252);
}

export const handler = async (event: FetchTechnicalsEvent): Promise<FetchTechnicalsEvent> => {
  const bucketName = process.env.BUCKET_NAME!;

  const { ticker, date } = event;
  const symbol = ticker.symbol;

  info('fetch-technicals started', { symbol, date });

  let bars: OhlcvBar[];
  try {
    bars = await fetchDailyOhlcv(symbol);
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
