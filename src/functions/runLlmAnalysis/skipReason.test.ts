import { buildSkipReason } from './skipReason';
import { EnrichedTicker } from '../../types';

function makeEnriched(overrides: Partial<EnrichedTicker>): EnrichedTicker {
  return {
    earningsInWindow: false,
    candidateRejectionReasons: [],
    ivRankSignal: 'SELL_ENVIRONMENT',
    rawFundamentals: { symbol: 'TEST', fetchedAt: '' },
    rawOptions: {
      symbol: 'TEST',
      ivRank: 45,
      ivPercentile: 0,
      iv30d: 0,
      hv30d: 0,
      volSurface: [],
      candidateStrikes: [],
      fetchedAt: '',
    },
    ...overrides,
  } as unknown as EnrichedTicker;
}

describe('buildSkipReason', () => {
  it('returns earnings reason when earnings are inside the window', () => {
    const enriched = makeEnriched({
      earningsInWindow: true,
      rawFundamentals: {
        symbol: 'MSFT',
        earningsDte: 5,
        earningsDate: '2026-04-29',
        fetchedAt: '',
      },
    });

    const reason = buildSkipReason(enriched);

    expect(reason).toContain('Earnings in 5 days');
    expect(reason).toContain('2026-04-29');
    expect(reason).toContain('Re-evaluate after 2026-04-29');
  });

  it('shows unknown date when earningsDate is missing', () => {
    const enriched = makeEnriched({
      earningsInWindow: true,
      rawFundamentals: { symbol: 'X', earningsDte: 3, fetchedAt: '' },
    });

    expect(buildSkipReason(enriched)).toContain('unknown date');
  });

  it('returns IV rank reason when IV rank signal is SKIP', () => {
    const enriched = makeEnriched({
      earningsInWindow: false,
      ivRankSignal: 'SKIP',
      rawOptions: {
        symbol: 'JPM',
        ivRank: 32,
        ivPercentile: 0,
        iv30d: 0,
        hv30d: 0,
        volSurface: [],
        candidateStrikes: [],
        fetchedAt: '',
      },
    });

    const reason = buildSkipReason(enriched);

    expect(reason).toContain('IV rank 32');
    expect(reason).toContain('min: 50');
  });

  it('earnings reason takes priority over IV rank', () => {
    const enriched = makeEnriched({
      earningsInWindow: true,
      ivRankSignal: 'SKIP',
      rawFundamentals: {
        symbol: 'AMZN',
        earningsDte: 4,
        earningsDate: '2026-04-29',
        fetchedAt: '',
      },
      rawOptions: {
        symbol: 'AMZN',
        ivRank: 20,
        ivPercentile: 0,
        iv30d: 0,
        hv30d: 0,
        volSurface: [],
        candidateStrikes: [],
        fetchedAt: '',
      },
    });

    expect(buildSkipReason(enriched)).toContain('Earnings in 4 days');
  });

  it('returns data unavailable as fallback', () => {
    const enriched = makeEnriched({
      earningsInWindow: false,
      ivRankSignal: 'SELL_ENVIRONMENT',
    });

    expect(buildSkipReason(enriched)).toBe('Data unavailable for one or more required inputs.');
  });

  it('returns mechanical candidate rejection reasons', () => {
    const enriched = makeEnriched({
      candidateRejectionReasons: [
        'Liquidity below threshold: open interest 100, bid/ask spread 28.6%.',
        'Annualised yield 5.5% is below target 10.0%.',
      ],
    });

    expect(buildSkipReason(enriched)).toContain('Liquidity below threshold');
    expect(buildSkipReason(enriched)).toContain('below target');
  });
});
