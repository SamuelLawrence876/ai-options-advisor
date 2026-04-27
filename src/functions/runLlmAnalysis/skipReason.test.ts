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
    rawTechnicals: { trend: 'NEUTRAL' },
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

  it('uses Chain-proxy source label when ivRankSource is CHAIN_PROXY', () => {
    const enriched = makeEnriched({
      earningsInWindow: false,
      ivRankSignal: 'SKIP',
      rawOptions: {
        symbol: 'XOM',
        ivRank: 42,
        ivRankSource: 'CHAIN_PROXY',
        ivPercentile: 0,
        iv30d: 0,
        hv30d: 0,
        volSurface: [],
        candidateStrikes: [],
        fetchedAt: '',
      },
    });

    const reason = buildSkipReason(enriched);

    expect(reason).toContain('Chain-proxy IV rank');
    expect(reason).toContain('threshold (65)');
  });

  it('returns neutral-zone message when IV rank signal is SKIP', () => {
    const enriched = makeEnriched({
      earningsInWindow: false,
      ivRankSignal: 'SKIP',
      rawOptions: {
        symbol: 'JPM',
        ivRank: 42,
        ivPercentile: 0,
        iv30d: 0,
        hv30d: 0,
        volSurface: [],
        candidateStrikes: [],
        fetchedAt: '',
      },
    });

    const reason = buildSkipReason(enriched);

    expect(reason).toContain('IV rank 42.00');
    expect(reason).toContain('neutral zone');
    expect(reason).toContain('threshold (50)');
    expect(reason).toContain('threshold (35)');
  });

  it('returns low-IV message when IV rank signal is BUY_ENVIRONMENT but trend is neutral', () => {
    const enriched = makeEnriched({
      earningsInWindow: false,
      ivRankSignal: 'BUY_ENVIRONMENT',
      rawOptions: {
        symbol: 'AAPL',
        ivRank: 22,
        ivPercentile: 0,
        iv30d: 0,
        hv30d: 0,
        volSurface: [],
        candidateStrikes: [],
        fetchedAt: '',
      },
    });

    const reason = buildSkipReason(enriched);

    expect(reason).toContain('IV rank 22.00');
    expect(reason).toContain('low IV');
    expect(reason).toContain('no directional trend');
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

  it('rejection reason takes priority over neutral-zone IV signal', () => {
    const enriched = makeEnriched({
      ivRankSignal: 'SKIP',
      candidateRejectionReasons: ['No mechanically valid candidate trade was found in the option chain.'],
    });

    expect(buildSkipReason(enriched)).toContain('No mechanically valid');
    expect(buildSkipReason(enriched)).not.toContain('neutral zone');
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
