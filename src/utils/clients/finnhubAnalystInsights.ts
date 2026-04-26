import { buildFinnhubUrl } from './finnhubRequest';

interface FinnhubPriceTargetResponse {
  targetMean?: number;
}

interface FinnhubRecommendationEntry {
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;
}

export async function fetchFinnhubPriceTarget(
  symbol: string,
  apiKey: string,
): Promise<number | undefined> {
  const url = buildFinnhubUrl('/stock/price-target', { symbol, token: apiKey });
  const response = await fetch(url);
  const data = (await response.json()) as FinnhubPriceTargetResponse;
  return data?.targetMean ?? undefined;
}

export async function fetchFinnhubRecommendations(
  symbol: string,
  apiKey: string,
): Promise<{ buyCount: number; holdCount: number; sellCount: number }> {
  const url = buildFinnhubUrl('/stock/recommendation', { symbol, token: apiKey });
  const response = await fetch(url);
  const data = (await response.json()) as FinnhubRecommendationEntry[];
  const latest = Array.isArray(data) ? data[0] : undefined;
  if (!latest) return { buyCount: 0, holdCount: 0, sellCount: 0 };
  return {
    buyCount: (latest.buy ?? 0) + (latest.strongBuy ?? 0),
    holdCount: latest.hold ?? 0,
    sellCount: (latest.sell ?? 0) + (latest.strongSell ?? 0),
  };
}
