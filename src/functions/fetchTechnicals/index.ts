import { MarketContext, TechnicalsData, WatchlistItem } from '../../types';
import { error, info } from '../../utils/logger';
import { computeAtr, computeMovingAverage, classifyTrend } from '../../utils/metrics';
import { putJson } from '../../utils/aws/s3';
import { fetchYahooOhlcv } from '../../utils/clients/yahoo';

interface FetchTechnicalsEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

export const handler = async (event: FetchTechnicalsEvent): Promise<FetchTechnicalsEvent> => {
  const bucketName = process.env.BUCKET_NAME!;

  const { ticker, date } = event;
  const symbol = ticker.symbol;

  info('fetch-technicals started', { symbol, date });

  let bars;
  try {
    bars = await fetchYahooOhlcv(symbol, '1y');
  } catch (err) {
    error(`Daily OHLCV fetch failed for ${symbol}`, err as Error);
    throw err;
  }

  const slicedBars = bars.slice(-252);
  const closes = slicedBars.map(b => b.close);
  const price = closes[closes.length - 1] ?? 0;
  const ma20 = computeMovingAverage(closes, 20);
  const ma50 = computeMovingAverage(closes, 50);
  const trend = classifyTrend(price, ma20, ma50);
  const atr14 = computeAtr(slicedBars, 14);
  const atrPct = price > 0 ? (atr14 / price) * 100 : 0;

  const high52w = Math.max(...closes);
  const low52w = Math.min(...closes);
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
