export type StrategyPref = 'COVERED_CALL' | 'CSP' | 'PUT_CREDIT_SPREAD' | 'IRON_CONDOR' | 'ANY';

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

export interface HumanContextEntry {
  pk: string;
  timestamp: string;
  context: string;
  expires?: string;
  source: string;
}

export type VixRegime = 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
export type MarketTrend = 'BULL' | 'NEUTRAL' | 'BEAR';
export type TrendClassification = 'BULLISH' | 'NEUTRAL' | 'BEARISH';

export interface SectorIv {
  etf: string;
  iv: number;
}

export interface MarketContext {
  date: string;
  vix: number;
  vix20dAvg: number;
  vixRegime: VixRegime;
  spyPrice: number;
  spyTrend: MarketTrend;
  qqqPrice: number;
  qqqTrend: MarketTrend;
  marketTrend: MarketTrend;
  sectorIvs: Record<string, number>;
  fetchedAt: string;
}

export interface OptionsData {
  symbol: string;
  ivRank: number;
  ivPercentile: number;
  iv30d: number;
  hv30d: number;
  volSurface: VolSurfacePoint[];
  candidateStrikes: CandidateStrike[];
  gammaFlip?: number;
  callWall?: number;
  putWall?: number;
  fetchedAt: string;
}

export interface VolSurfacePoint {
  expiry: string;
  strike: number;
  iv: number;
  delta: number;
}

export interface CandidateStrike {
  expiry: string;
  dte: number;
  strike: number;
  optionType: 'call' | 'put';
  delta: number;
  theta: number;
  vega: number;
  bid: number;
  ask: number;
  mid: number;
  openInterest: number;
  volume: number;
}

export interface FundamentalsData {
  symbol: string;
  earningsDate?: string;
  earningsDte?: number;
  historicalEarningsMovePct?: number;
  exDivDate?: string;
  exDivDte?: number;
  annualDividendYield?: number;
  shortInterestPct?: number;
  daysToCover?: number;
  analystConsensus?: string;
  meanPriceTarget?: number;
  priceTargetDistance?: number;
  recentUpgrades?: number;
  recentDowngrades?: number;
  unusualActivityFlag?: boolean;
  unusualActivityDirection?: 'call' | 'put';
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

export interface TechnicalsData {
  symbol: string;
  price: number;
  high52w: number;
  low52w: number;
  distanceFromHigh52wPct: number;
  ma20: number;
  ma50: number;
  trend: TrendClassification;
  atr14: number;
  atrPct: number;
  priceVsMa20Pct: number;
  priceVsMa50Pct: number;
  fetchedAt: string;
}

export type StrategyRecommendation =
  | 'COVERED_CALL'
  | 'PUT_CREDIT_SPREAD'
  | 'CSP'
  | 'IRON_CONDOR'
  | 'SKIP'
  | 'WATCH';

export type EarningsProximity = 'CLEAR' | 'CAUTION' | 'DANGER';

export interface CandidateTrade {
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
  maxLoss: number;
  bpr: number;
  annualisedYield: number;
  robpAnnualised: number;
  liquidityOk: boolean;
}

export interface EnrichedTicker {
  ticker: WatchlistItem;
  date: string;
  vrp: number;
  ivRankSignal: 'SELL_ENVIRONMENT' | 'SKIP';
  ivVsSector: 'ABOVE' | 'BELOW' | 'INLINE';
  earningsInWindow: boolean;
  earningsProximity: EarningsProximity;
  exDivInWindow: boolean;
  near52wHigh: boolean;
  atrPct: number;
  premiumCoversAtr: boolean;
  liquidityOk: boolean;
  suggestedStrategy: StrategyRecommendation;
  candidateTrade?: CandidateTrade;
  marketContext: MarketContext;
  rawOptions: OptionsData;
  rawFundamentals: FundamentalsData;
  rawTechnicals: TechnicalsData;
}

export interface TickerAnalysis {
  symbol: string;
  recommendation: StrategyRecommendation;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  adjustedStrike?: number;
  adjustedExpiry?: string;
  reasoning: string;
  risks: string[];
  flags: string[];
  annualisedYield?: number;
  maxLoss?: number;
  buyingPowerRequired?: number;
  robpAnnualised?: number;
}

export interface TopPick {
  symbol: string;
  strategy: StrategyRecommendation;
  tradeDescription: string;
  maxLoss: number;
  buyingPower: number;
  annualisedYield: number;
  robpAnnualised: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasoning: string;
  risks: string[];
}

export interface PortfolioSynthesis {
  topPicks: TopPick[];
  executiveSummary: string;
  sectorConcentrationWarnings: string[];
  correlatedRiskWarnings: string[];
  macroNote: string;
  robpVsYieldDivergences: string[];
}

export interface IvSnapshot {
  symbol: string;
  date: string;
  iv30d: number;
  ivRank: number;
  ivPercentile: number;
  hv30d: number;
  vrp: number;
}

export interface ReportMetadata {
  reportDate: string;
  s3Key: string;
  tickersAnalysed: string[];
  topPicks: Array<{ symbol: string; strategy: string }>;
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
}
