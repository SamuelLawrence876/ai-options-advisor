import { OptionType } from './options';
import { SymbolSnapshot } from './symbolSnapshot';

export interface NewsHeadline {
  headline: string;
  source: string;
  date: string;
}

export interface FundamentalsData extends SymbolSnapshot {
  recentNews?: NewsHeadline[];
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
  unusualActivityDirection?: OptionType;
}
