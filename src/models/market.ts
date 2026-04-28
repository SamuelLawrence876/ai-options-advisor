export type VixRegime = 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
export type MarketTrend = 'BULL' | 'NEUTRAL' | 'BEAR';
export type TrendClassification = 'BULLISH' | 'NEUTRAL' | 'BEARISH';
export type MacroImpact = 'HIGH' | 'MEDIUM' | 'LOW';

export interface MacroEvent {
  event: string;
  date: string;
  daysAway: number;
  impact: MacroImpact;
}

export interface MarketContext {
  date: string;
  vix: number;
  vixRegime: VixRegime;
  spyPrice: number;
  spyTrend: MarketTrend;
  qqqPrice: number;
  qqqTrend: MarketTrend;
  marketTrend: MarketTrend;
  macroEvents: MacroEvent[];
  fetchedAt: string;
}

export interface OhlcvBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
