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
