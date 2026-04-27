export type StrategyRecommendation =
  | 'COVERED_CALL'
  | 'PUT_CREDIT_SPREAD'
  | 'CALL_CREDIT_SPREAD'
  | 'CALL_DEBIT_SPREAD'
  | 'PUT_DEBIT_SPREAD'
  | 'CSP'
  | 'SKIP'
  | 'WATCH';

export type EarningsProximity = 'CLEAR' | 'CAUTION' | 'DANGER';

export interface TradeMetrics {
  maxLoss: number;
  annualisedYield: number;
  robpAnnualised: number;
}

export interface CandidateTrade extends TradeMetrics {
  strategy: StrategyRecommendation;
  expiry: string;
  dte: number;
  strike: number;
  longStrike?: number;
  delta: number;
  theta: number;
  premiumMid: number;
  bid: number;
  ask: number;
  spreadPct: number;
  openInterest: number;
  bpr: number;
  liquidityOk: boolean;
}
