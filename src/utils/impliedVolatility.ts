export function computeIvRank(currentIv: number, historicalIvs: number[]): number | undefined {
  const values = historicalIvs.filter(value => Number.isFinite(value) && value > 0);
  if (values.length < 5 || !Number.isFinite(currentIv) || currentIv <= 0) return undefined;

  const low = Math.min(...values);
  const high = Math.max(...values);
  if (high === low) return currentIv >= high ? 100 : 0;

  return Math.min(Math.max(((currentIv - low) / (high - low)) * 100, 0), 100);
}
