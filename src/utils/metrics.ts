import {
  MarketTrend,
  OhlcvBar,
  StrategyRecommendation,
  TrendClassification,
  VixRegime,
} from '../types';

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

export function computeHistoricalVolatility(closes: number[], period = 30): number {
  if (closes.length < 2) return 0;
  const recent = closes.slice(-(period + 1));
  if (recent.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < recent.length; i += 1) {
    const previous = recent[i - 1];
    const current = recent[i];
    if (previous > 0 && current > 0) returns.push(Math.log(current / previous));
  }

  if (returns.length < 2) return 0;

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export function classifyTrend(price: number, ma20: number, ma50: number): TrendClassification {
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

export function computeMaxLoss(strategy: StrategyRecommendation, params: MaxLossParams): number {
  const { costBasis, spreadWidth, strike, premiumCollected } = params;
  switch (strategy) {
    case 'COVERED_CALL':
      return ((costBasis ?? strike) - premiumCollected) * 100;
    case 'PUT_CREDIT_SPREAD':
      return Math.max(0, ((spreadWidth ?? 5) - premiumCollected) * 100);
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

export function computeRobp(premiumCollected: number, bpr: number, dte: number): number {
  if (bpr <= 0) return 0;
  const robp = (premiumCollected * 100) / bpr;
  return robp * (365 / dte) * 100;
}

export function computeAnnualisedYield(premium: number, strike: number, dte: number): number {
  if (strike === 0 || dte === 0) return 0;
  return (premium / strike) * (365 / dte) * 100;
}

export function computeIvRank(currentIv: number, historicalIvs: number[]): number | undefined {
  const values = historicalIvs.filter(value => Number.isFinite(value) && value > 0);
  if (values.length < 5 || !Number.isFinite(currentIv) || currentIv <= 0) return undefined;

  const low = Math.min(...values);
  const high = Math.max(...values);
  if (high === low) return currentIv >= high ? 100 : 0;

  return Math.min(Math.max(((currentIv - low) / (high - low)) * 100, 0), 100);
}

export function classifyVixRegime(vix: number): VixRegime {
  if (vix < 15) return 'LOW';
  if (vix < 25) return 'NORMAL';
  if (vix < 35) return 'ELEVATED';
  return 'EXTREME';
}

export function classifyMarketTrend(price: number, ma20: number, ma50: number): MarketTrend {
  if (price > ma50 && ma20 > ma50) return 'BULL';
  if (price < ma50 && ma20 < ma50) return 'BEAR';
  return 'NEUTRAL';
}
