import { OhlcvBar, TrendClassification } from '../types';

export function computeMovingAverage(closes: number[], period: number): number | undefined {
  if (closes.length < period) return undefined;
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

export function classifyTrend(
  price: number,
  ma20: number | undefined,
  ma50: number | undefined,
): TrendClassification | undefined {
  if (ma20 === undefined || ma50 === undefined) return undefined;
  if (price > ma50 && ma20 > ma50) return 'BULLISH';
  if (price < ma50 && ma20 < ma50) return 'BEARISH';
  return 'NEUTRAL';
}
