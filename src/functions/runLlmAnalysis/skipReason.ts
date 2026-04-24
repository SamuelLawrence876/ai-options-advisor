import { EnrichedTicker } from '../../types';

export function buildSkipReason(enriched: EnrichedTicker): string {
  if (enriched.earningsInWindow) {
    const dte = enriched.rawFundamentals.earningsDte;
    const date = enriched.rawFundamentals.earningsDate ?? 'unknown date';
    return `Earnings in ${dte} days (${date}) — inside expiry window. Re-evaluate after ${date}.`;
  }
  if (enriched.ivRankSignal === 'SKIP') {
    const rank = enriched.rawOptions.ivRank.toFixed(0);
    return `IV rank ${rank} below threshold (min: 50) — insufficient premium environment.`;
  }
  return 'Data unavailable for one or more required inputs.';
}
