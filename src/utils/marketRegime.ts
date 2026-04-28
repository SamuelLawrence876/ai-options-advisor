import { MarketTrend, VixRegime } from '../types';

export function classifyVixRegime(vix: number): VixRegime {
  if (vix < 15) return 'LOW';
  if (vix < 25) return 'NORMAL';
  if (vix < 35) return 'ELEVATED';
  return 'EXTREME';
}

export function classifyMarketTrend(
  price: number,
  ma20: number | undefined,
  ma50: number | undefined,
): MarketTrend {
  if (ma20 === undefined || ma50 === undefined) return 'NEUTRAL';
  if (price > ma50 && ma20 > ma50) return 'BULL';
  if (price < ma50 && ma20 < ma50) return 'BEAR';
  return 'NEUTRAL';
}
