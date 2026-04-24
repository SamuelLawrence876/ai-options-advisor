import { EnrichedTicker, IvSnapshot } from '../../types';

export function buildIvSnapshots(enrichedTickers: EnrichedTicker[], date: string): IvSnapshot[] {
  return enrichedTickers
    .filter(e => e.rawOptions != null)
    .map(e => ({
      symbol: e.ticker.symbol,
      date,
      iv30d: e.rawOptions.iv30d,
      ivRank: e.rawOptions.ivRank,
      ivPercentile: e.rawOptions.ivPercentile,
      hv30d: e.rawOptions.hv30d,
      vrp: e.vrp,
    }));
}
