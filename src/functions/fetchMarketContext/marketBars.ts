import { OhlcvBar } from '../../types';
import { fetchCboeVix } from '../../utils/clients/cboe';
import { fetchFinnhubQuote } from '../../utils/clients/finnhubQuote';
import { fetchPolygonOhlcv } from '../../utils/clients/polygon';

export interface MarketBarsResult {
  spyBars: OhlcvBar[];
  qqqBars: OhlcvBar[];
  vixPrice: number;
  spyPrice: number;
  qqqPrice: number;
}

export async function fetchMarketBars(
  finnhubKey: string,
  polygonKey: string,
  from: string,
  to: string,
): Promise<MarketBarsResult> {
  const [spyBars, qqqBars, spyPrice, qqqPrice, vixPrice] = await Promise.all([
    fetchPolygonOhlcv('SPY', from, to, polygonKey),
    fetchPolygonOhlcv('QQQ', from, to, polygonKey),
    fetchFinnhubQuote('SPY', finnhubKey),
    fetchFinnhubQuote('QQQ', finnhubKey),
    fetchCboeVix(),
  ]);
  return { spyBars, qqqBars, vixPrice, spyPrice, qqqPrice };
}
