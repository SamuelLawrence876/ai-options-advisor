import { StrategyRecommendation, TrendClassification } from '../../types';

export function selectStrategy(
  trend: TrendClassification | undefined,
  ivRank: number,
  ivRankSource: string,
  earningsClear: boolean,
  _atrPct: number,
  strategyPref: string,
  sharesHeld: number | undefined,
): StrategyRecommendation {
  if (!earningsClear) return 'SKIP';
  if (trend === undefined) return 'SKIP';

  const sellThreshold = ivRankSource === 'HISTORICAL' ? 50 : 60;
  const buyThreshold = 35;
  const canSellCoveredCall = (sharesHeld ?? 0) >= 100;

  if (ivRank >= sellThreshold) {
    if (strategyPref === 'COVERED_CALL' && canSellCoveredCall) return 'COVERED_CALL';
    if (trend === 'BULLISH') return 'PUT_CREDIT_SPREAD';
    if (trend === 'BEARISH') return 'CALL_CREDIT_SPREAD';
    return 'IRON_CONDOR';
  }

  if (ivRank <= buyThreshold) {
    if (trend === 'BULLISH') return 'CALL_DEBIT_SPREAD';
    if (trend === 'BEARISH') return 'PUT_DEBIT_SPREAD';
    return 'SKIP';
  }

  // Neutral IV zone: not enough premium to sell, no clear direction to buy
  return 'SKIP';
}
