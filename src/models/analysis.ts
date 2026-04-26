import { StrategyRecommendation, TradeMetrics } from './trade';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AnalysisNarrative {
  confidence: Confidence;
  reasoning: string;
  risks: string[];
}

export interface TickerAnalysis extends AnalysisNarrative {
  symbol: string;
  recommendation: StrategyRecommendation;
  adjustedStrike?: number;
  adjustedExpiry?: string;
  flags: string[];
  annualisedYield?: number;
  maxLoss?: number;
  buyingPowerRequired?: number;
  robpAnnualised?: number;
}

export interface TopPick extends AnalysisNarrative, TradeMetrics {
  symbol: string;
  strategy: StrategyRecommendation;
  tradeDescription: string;
  buyingPower: number;
}

export interface PortfolioSynthesis {
  topPicks: TopPick[];
  executiveSummary: string;
  sectorConcentrationWarnings: string[];
  correlatedRiskWarnings: string[];
  macroNote: string;
  robpVsYieldDivergences: string[];
}
