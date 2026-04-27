import { StrategyRecommendation } from '../../types';

export function selectStrategy(
  trend: string,
  ivRank: number,
  ivRankSource: string,
  earningsClear: boolean,
  _atrPct: number,
  strategyPref: string,
  sharesHeld: number | undefined,
): StrategyRecommendation {
  if (!earningsClear) return 'SKIP';

  const sellThreshold = ivRankSource === 'HISTORICAL' ? 50 : 65;
  const buyThreshold = 35;
  const canSellCoveredCall = (sharesHeld ?? 0) >= 100;

  if (ivRank >= sellThreshold) {
    if (strategyPref === 'COVERED_CALL' && canSellCoveredCall) return 'COVERED_CALL';
    if (trend === 'BULLISH') return 'PUT_CREDIT_SPREAD';
    if (trend === 'BEARISH') return 'CALL_CREDIT_SPREAD';
    return canSellCoveredCall ? 'COVERED_CALL' : 'CSP';
  }

  if (ivRank <= buyThreshold) {
    if (trend === 'BULLISH') return 'CALL_DEBIT_SPREAD';
    if (trend === 'BEARISH') return 'PUT_DEBIT_SPREAD';
    return 'SKIP';
  }

  return 'SKIP';
}
