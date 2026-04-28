import { EarningsProximity } from '../../types';

export function earningsProximity(
  earningsDte: number | undefined,
  tradeDte?: number,
): EarningsProximity {
  if (earningsDte === undefined) return 'CLEAR';
  // Earnings after the trade expires — no overlap risk
  if (tradeDte !== undefined && earningsDte > tradeDte) return 'CLEAR';
  if (earningsDte < 14) return 'DANGER';
  if (earningsDte < 21) return 'CAUTION';
  return 'CLEAR';
}

// Earnings "in window" only when they are a future event that falls on or before expiry.
// Negative earningsDte means earnings already happened — must not block the trade.
export function computeEarningsInWindow(
  earningsDte: number | undefined,
  tradeDte: number,
): boolean {
  return earningsDte !== undefined && earningsDte > 0 && earningsDte <= tradeDte;
}
