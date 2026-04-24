import { OhlcvBar } from '../../types';
import { fetchFinnhubOhlcv, fetchFinnhubQuote } from '../../utils/clients/finnhub';

export interface MarketBarsResult {
  vixBars: OhlcvBar[];
  spyBars: OhlcvBar[];
  qqqBars: OhlcvBar[];
  vixPrice: number;
  spyPrice: number;
  qqqPrice: number;
}

export async function fetchMarketBars(
  finnhubKey: string,
  from: string,
  to: string,
): Promise<MarketBarsResult> {
  const [vixBars, spyBars, qqqBars, spyPrice, qqqPrice, vixPrice] = await Promise.all([
    fetchFinnhubOhlcv('^VIX', from, to, finnhubKey),
    fetchFinnhubOhlcv('SPY', from, to, finnhubKey),
    fetchFinnhubOhlcv('QQQ', from, to, finnhubKey),
    fetchFinnhubQuote('SPY', finnhubKey),
    fetchFinnhubQuote('QQQ', finnhubKey),
    fetchFinnhubQuote('^VIX', finnhubKey),
  ]);
  return { vixBars, spyBars, qqqBars, vixPrice, spyPrice, qqqPrice };
}
