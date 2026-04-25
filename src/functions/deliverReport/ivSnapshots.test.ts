import { buildIvSnapshots } from './ivSnapshots';
import { EnrichedTicker } from '../../types';

function makeEnriched(symbol: string, ivRank: number): EnrichedTicker {
  return {
    ticker: { symbol } as EnrichedTicker['ticker'],
    vrp: 5,
    rawOptions: {
      symbol,
      ivRank,
      ivPercentile: 60,
      ivRankSource: 'HISTORICAL',
      iv30d: 30,
      hv30d: 25,
      volSurface: [],
      candidateStrikes: [],
      fetchedAt: '',
    },
  } as unknown as EnrichedTicker;
}

describe('buildIvSnapshots', () => {
  it('maps enriched tickers to IV snapshot shape', () => {
    const snapshots = buildIvSnapshots([makeEnriched('NVDA', 72)], '2026-04-24');

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual({
      symbol: 'NVDA',
      date: '2026-04-24',
      iv30d: 30,
      ivRank: 72,
      ivPercentile: 60,
      ivRankSource: 'HISTORICAL',
      hv30d: 25,
      vrp: 5,
    });
  });

  it('filters out tickers with null rawOptions', () => {
    const withNull = { rawOptions: null } as unknown as EnrichedTicker;
    const snapshots = buildIvSnapshots([withNull, makeEnriched('SPY', 40)], '2026-04-24');

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].symbol).toBe('SPY');
  });

  it('returns empty array when no tickers are provided', () => {
    expect(buildIvSnapshots([], '2026-04-24')).toEqual([]);
  });
});
