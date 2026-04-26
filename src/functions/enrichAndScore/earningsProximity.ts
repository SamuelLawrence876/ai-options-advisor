import { EarningsProximity } from '../../types';

export function earningsProximity(earningsDte: number | undefined): EarningsProximity {
  if (earningsDte === undefined) return 'CLEAR';
  if (earningsDte < 14) return 'DANGER';
  if (earningsDte < 21) return 'CAUTION';
  return 'CLEAR';
}
