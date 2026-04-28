import { CandidateTrade, WatchlistItem } from '../../types';

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function candidateRejectionReasons(
  candidate: CandidateTrade | undefined,
  ticker: WatchlistItem,
  earningsInWindow: boolean,
  exDivInWindow: boolean,
): string[] {
  if (!candidate) return ['No mechanically valid candidate trade was found in the option chain.'];

  const reasons: string[] = [];
  const hasValidMath =
    positiveFinite(candidate.dte) &&
    positiveFinite(candidate.premiumMid) &&
    positiveFinite(candidate.bid) &&
    positiveFinite(candidate.ask) &&
    positiveFinite(candidate.maxLoss) &&
    positiveFinite(candidate.bpr) &&
    positiveFinite(candidate.annualisedYield) &&
    positiveFinite(candidate.robpAnnualised);

  if (!hasValidMath) {
    reasons.push('Candidate has invalid risk, premium, or return math.');
  }

  if (!candidate.liquidityOk) {
    reasons.push(
      `Liquidity below threshold: open interest ${candidate.openInterest}, bid/ask spread ${candidate.spreadPct.toFixed(1)}%.`,
    );
  }

  if (ticker.targetYieldPct !== undefined && candidate.annualisedYield < ticker.targetYieldPct) {
    reasons.push(
      `Annualised yield ${candidate.annualisedYield.toFixed(1)}% is below target ${ticker.targetYieldPct.toFixed(1)}%.`,
    );
  }

  if (earningsInWindow) {
    reasons.push("Earnings fall within this trade's expiry window.");
  }

  if (candidate.strategy === 'COVERED_CALL' && exDivInWindow) {
    reasons.push('Ex-dividend date falls inside the expiry window for this covered call.');
  }

  return reasons;
}
