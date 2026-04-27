import { EnrichedTicker } from '../../types';

export function buildSkipReason(enriched: EnrichedTicker): string {
  if (enriched.earningsInWindow) {
    const dte = enriched.rawFundamentals.earningsDte;
    const date = enriched.rawFundamentals.earningsDate ?? 'unknown date';
    return `Earnings in ${dte} days (${date}) — inside expiry window. Re-evaluate after ${date}.`;
  }
  if (enriched.ivRankSignal === 'SKIP') {
    const rank = enriched.rawOptions.ivRank.toFixed(2);
    const isProxy = enriched.rawOptions.ivRankSource === 'CHAIN_PROXY';
    const source = isProxy ? 'Chain-proxy IV rank' : 'IV rank';
    const sellThreshold = isProxy ? 65 : 50;
    return `${source} ${rank} in neutral zone — below premium-selling threshold (${sellThreshold}) and above debit-spread threshold (35).`;
  }
  if (enriched.ivRankSignal === 'BUY_ENVIRONMENT') {
    const rank = enriched.rawOptions.ivRank.toFixed(2);
    return `IV rank ${rank} (low IV) — no directional trend to support a debit spread.`;
  }
  if (enriched.candidateRejectionReasons.length > 0) {
    return enriched.candidateRejectionReasons.join(' ');
  }
  return 'Data unavailable for one or more required inputs.';
}
