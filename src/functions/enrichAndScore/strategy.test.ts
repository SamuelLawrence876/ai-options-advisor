import {
  CandidateStrike,
  FundamentalsData,
  OptionsData,
  TechnicalsData,
  WatchlistItem,
} from '../../types';
import { earningsProximity, selectCandidateStrike, selectStrategy } from './strategy';

const watchlistItem: WatchlistItem = {
  symbol: 'AMZN',
  strategyPref: 'ANY',
  minDte: 21,
  maxDte: 45,
  active: true,
};

const fundamentals: FundamentalsData = {
  symbol: 'AMZN',
  fetchedAt: '2026-04-25T00:00:00.000Z',
};

const technicals: TechnicalsData = {
  symbol: 'AMZN',
  price: 240,
  high52w: 250,
  low52w: 120,
  distanceFromHigh52wPct: 4,
  ma20: 230,
  ma50: 220,
  trend: 'BULLISH',
  atr14: 4,
  atrPct: 1.7,
  hv30d: 22,
  priceVsMa20Pct: 4.3,
  priceVsMa50Pct: 9.1,
  fetchedAt: '2026-04-25T00:00:00.000Z',
};

const putCandidate = (strike: number, mid: number, delta = -0.27): CandidateStrike => ({
  expiry: '2026-05-31',
  dte: 36,
  strike,
  optionType: 'put',
  delta,
  theta: 0.05,
  vega: 0,
  bid: mid - 0.1,
  ask: mid + 0.1,
  mid,
  openInterest: 1000,
  volume: 10,
});

const optionsWithCandidate = (candidate: CandidateStrike): OptionsData => ({
  symbol: 'AMZN',
  ivRank: 60,
  ivPercentile: 70,
  iv30d: 45,
  hv30d: 30,
  volSurface: [],
  candidateStrikes: [candidate],
  fetchedAt: '2026-04-25T00:00:00.000Z',
});

const optionsWithCandidates = (candidates: CandidateStrike[]): OptionsData => ({
  symbol: 'AMZN',
  ivRank: 60,
  ivPercentile: 70,
  iv30d: 45,
  hv30d: 30,
  volSurface: [],
  candidateStrikes: candidates,
  fetchedAt: '2026-04-25T00:00:00.000Z',
});

describe('earningsProximity', () => {
  it('returns CLEAR when earningsDte is undefined', () => {
    expect(earningsProximity(undefined)).toBe('CLEAR');
  });

  it('returns DANGER when earnings are within 14 days', () => {
    expect(earningsProximity(13)).toBe('DANGER');
    expect(earningsProximity(1)).toBe('DANGER');
  });

  it('returns CAUTION when earnings are between 14 and 21 days', () => {
    expect(earningsProximity(14)).toBe('CAUTION');
    expect(earningsProximity(20)).toBe('CAUTION');
  });

  it('returns CLEAR when earnings are 21 or more days away', () => {
    expect(earningsProximity(21)).toBe('CLEAR');
    expect(earningsProximity(60)).toBe('CLEAR');
  });
});

describe('selectStrategy', () => {
  it('returns SKIP when earnings are inside the expiry window', () => {
    expect(selectStrategy('BULLISH', 70, false, 1.5, 'ANY', undefined)).toBe('SKIP');
  });

  it('returns SKIP when IV rank is below 50', () => {
    expect(selectStrategy('BULLISH', 49, true, 1.5, 'ANY', undefined)).toBe('SKIP');
  });

  it('returns COVERED_CALL when strategyPref is COVERED_CALL and shares are held', () => {
    expect(selectStrategy('BULLISH', 60, true, 1.5, 'COVERED_CALL', 100)).toBe('COVERED_CALL');
  });

  it('does not return COVERED_CALL when no shares are held', () => {
    expect(selectStrategy('BULLISH', 60, true, 1.5, 'COVERED_CALL', 0)).not.toBe('COVERED_CALL');
  });

  it('requires at least 100 shares for covered calls', () => {
    expect(selectStrategy('NEUTRAL', 55, true, 2.5, 'ANY', 99)).toBe('CSP');
    expect(selectStrategy('NEUTRAL', 55, true, 2.5, 'ANY', 100)).toBe('COVERED_CALL');
  });

  it('returns PUT_CREDIT_SPREAD for BULLISH trend with sufficient IV rank', () => {
    expect(selectStrategy('BULLISH', 60, true, 1.5, 'ANY', undefined)).toBe('PUT_CREDIT_SPREAD');
  });

  it('returns IRON_CONDOR for NEUTRAL trend with IV rank >= 60 and low ATR', () => {
    expect(selectStrategy('NEUTRAL', 65, true, 1.5, 'ANY', undefined)).toBe('IRON_CONDOR');
  });

  it('returns CSP for BEARISH trend with sufficient IV rank', () => {
    expect(selectStrategy('BEARISH', 60, true, 1.5, 'ANY', undefined)).toBe('CSP');
  });

  it('earnings block takes priority over IV rank block', () => {
    expect(selectStrategy('BULLISH', 30, false, 1.5, 'ANY', undefined)).toBe('SKIP');
  });
});

describe('selectCandidateStrike', () => {
  it('returns undefined for credit spreads with credit greater than spread width', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 6), putCandidate(235, 0.5)]),
      fundamentals,
      technicals,
      watchlistItem,
      'PUT_CREDIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns a positive-risk credit spread when credit is below spread width', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 2.2), putCandidate(235, 1)]),
      fundamentals,
      technicals,
      watchlistItem,
      'PUT_CREDIT_SPREAD',
    );

    expect(candidate?.longStrike).toBe(235);
    expect(candidate?.maxLoss).toBe(380);
    expect(candidate?.bpr).toBe(380);
    expect(candidate?.robpAnnualised).toBeGreaterThan(0);
  });

  it('returns undefined when no long put exists for a credit spread', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidate(putCandidate(240, 1.2)),
      fundamentals,
      technicals,
      watchlistItem,
      'PUT_CREDIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });
});
