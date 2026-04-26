import { StrategyRecommendation } from '../../types';

export function selectStrategy(
  trend: string,
  ivRank: number,
  earningsClear: boolean,
  atrPct: number,
  strategyPref: string,
  sharesHeld: number | undefined,
): StrategyRecommendation {
  if (!earningsClear) return 'SKIP';
  if (ivRank < 50) return 'SKIP';

  const canSellCoveredCall = (sharesHeld ?? 0) >= 100;

  if (strategyPref === 'COVERED_CALL' && canSellCoveredCall) return 'COVERED_CALL';
  if (trend === 'BULLISH' && ivRank >= 50) return 'PUT_CREDIT_SPREAD';
  if (trend === 'NEUTRAL' && ivRank >= 50) {
    return canSellCoveredCall ? 'COVERED_CALL' : 'CSP';
  }
  return 'CSP';
}
