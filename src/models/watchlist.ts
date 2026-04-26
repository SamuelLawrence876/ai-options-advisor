export type StrategyPref = 'COVERED_CALL' | 'CSP' | 'PUT_CREDIT_SPREAD' | 'ANY';

export interface WatchlistItem {
  symbol: string;
  strategyPref: StrategyPref;
  costBasis?: number;
  sharesHeld?: number;
  targetYieldPct?: number;
  maxDte: number;
  minDte: number;
  active: boolean;
  notes?: string;
  sector?: string;
}
