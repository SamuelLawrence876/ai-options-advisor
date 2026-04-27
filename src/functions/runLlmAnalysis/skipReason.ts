import { EnrichedTicker } from '../../types';

export function buildSkipReason(enriched: EnrichedTicker): string {
  if (enriched.earningsInWindow) {
    const dte = enriched.rawFundamentals.earningsDte;
    const date = enriched.rawFundamentals.earningsDate ?? 'unknown date';
    return `Earnings in ${dte} days (${date}) — inside expiry window. Re-evaluate after ${date}.`;
  }
  if (enriched.ivRankSignal === 'SKIP') {
    const rank = enriched.rawOptions.ivRank.toFixed(0);
    const isProxy = enriched.rawOptions.ivRankSource === 'CHAIN_PROXY';
    const source = isProxy ? 'Chain-proxy IV rank' : 'IV rank';
    const minThreshold = isProxy ? 65 : 50;
    return `${source} ${rank} below threshold (min: ${minThreshold}) — insufficient premium environment.`;
  }
  if (enriched.rawTechnicals.trend === 'BEARISH') {
    return 'Bearish price trend — directional bias unfavourable for premium-selling strategies. Re-evaluate when trend stabilises.';
  }
  if (enriched.candidateRejectionReasons.length > 0) {
    return enriched.candidateRejectionReasons.join(' ');
  }
  return 'Data unavailable for one or more required inputs.';
}
