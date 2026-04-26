import { FundamentalsData } from './fundamentals';
import { MarketContext } from './market';
import { OptionsData } from './options';
import { EarningsProximity, CandidateTrade, StrategyRecommendation } from './trade';
import { TechnicalsData } from './technicals';
import { WatchlistItem } from './watchlist';

export interface EnrichedTicker {
  ticker: WatchlistItem;
  date: string;
  vrp: number;
  ivRankSignal: 'SELL_ENVIRONMENT' | 'SKIP';
  candidateRejectionReasons: string[];
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
