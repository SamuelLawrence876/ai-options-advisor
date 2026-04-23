import { OhlcvBar, StrategyRecommendation, TrendClassification } from '../types';

export function computeMovingAverage(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

export function computeAtr(bars: OhlcvBar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const recent = trueRanges.slice(-period);
  return recent.reduce((sum, v) => sum + v, 0) / recent.length;
}

export function classifyTrend(
  price: number,
  ma20: number,
  ma50: number,
): TrendClassification {
  if (price > ma50 && ma20 > ma50) return 'BULLISH';
  if (price < ma50 && ma20 < ma50) return 'BEARISH';
  return 'NEUTRAL';
}

export interface MaxLossParams {
  costBasis?: number;
  spreadWidth?: number;
  strike: number;
  premiumCollected: number;
}

export function computeMaxLoss(
  strategy: StrategyRecommendation,
  params: MaxLossParams,
): number {
  const { costBasis, spreadWidth, strike, premiumCollected } = params;
  switch (strategy) {
    case 'COVERED_CALL':
      return ((costBasis ?? strike) - premiumCollected) * 100;
    case 'PUT_CREDIT_SPREAD':
      return ((spreadWidth ?? 5) - premiumCollected) * 100;
    case 'CSP':
    case 'IRON_CONDOR':
      return (strike - premiumCollected) * 100;
    default:
      return 0;
  }
}

export function computeBpr(
  strategy: StrategyRecommendation,
  sharePrice: number,
  maxLoss: number,
): number {
  switch (strategy) {
    case 'COVERED_CALL':
      return sharePrice * 100;
    case 'PUT_CREDIT_SPREAD':
    case 'CSP':
    case 'IRON_CONDOR':
      return maxLoss;
    default:
      return maxLoss;
  }
}

export function computeRobp(
  premiumCollected: number,
  bpr: number,
  dte: number,
): number {
  if (bpr === 0) return 0;
  const robp = premiumCollected / bpr;
  return robp * (365 / dte) * 100;
}

export function computeAnnualisedYield(
  premium: number,
  strike: number,
  dte: number,
): number {
  if (strike === 0 || dte === 0) return 0;
  return (premium / (strike * 100)) * (365 / dte) * 100;
}
