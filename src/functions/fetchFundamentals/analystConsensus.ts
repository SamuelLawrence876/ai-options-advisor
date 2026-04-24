export function deriveAnalystConsensus(
  buyCount: number,
  holdCount: number,
  sellCount: number,
): string {
  const total = buyCount + holdCount + sellCount;
  if (total === 0) return 'N/A';
  if (buyCount > sellCount + holdCount) return 'Buy';
  if (sellCount > buyCount + holdCount) return 'Sell';
  return 'Hold';
}
