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

  // Require a higher IV rank when we only have the chain proxy — it can
  // exceed 50 in a genuinely low-IV environment due to outlier strikes.
  const ivThreshold = ivRankSource === 'HISTORICAL' ? 50 : 65;
  if (ivRank < ivThreshold) return 'SKIP';

  const canSellCoveredCall = (sharesHeld ?? 0) >= 100;

  if (strategyPref === 'COVERED_CALL' && canSellCoveredCall) return 'COVERED_CALL';
  if (trend === 'BULLISH') return 'PUT_CREDIT_SPREAD';
  if (trend === 'BEARISH') return 'SKIP';
  if (trend === 'NEUTRAL') {
    return canSellCoveredCall ? 'COVERED_CALL' : 'CSP';
  }
  return 'CSP';
}
