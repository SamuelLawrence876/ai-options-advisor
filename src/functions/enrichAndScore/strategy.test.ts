import { CandidateStrike, OptionsData, TechnicalsData, WatchlistItem } from '../../types';
import { candidateRejectionReasons } from './candidateRejectionReasons';
import { selectCandidateStrike } from './candidateStrikeSelection';
import { earningsProximity } from './earningsProximity';
import { selectStrategy } from './strategySelection';

const watchlistItem: WatchlistItem = {
  symbol: 'AMZN',
  strategyPref: 'ANY',
  minDte: 21,
  maxDte: 45,
  active: true,
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

const callCandidate = (strike: number, mid: number, delta = 0.3): CandidateStrike => ({
  expiry: '2026-05-31',
  dte: 36,
  strike,
  optionType: 'call',
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
    expect(selectStrategy('BULLISH', 70, 'HISTORICAL', false, 1.5, 'ANY', undefined)).toBe('SKIP');
  });

  it('returns SKIP when IV rank is below 50 (historical source)', () => {
    expect(selectStrategy('BULLISH', 49, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('SKIP');
  });

  it('returns COVERED_CALL when strategyPref is COVERED_CALL and shares are held', () => {
    expect(selectStrategy('BULLISH', 60, 'HISTORICAL', true, 1.5, 'COVERED_CALL', 100)).toBe('COVERED_CALL');
  });

  it('does not return COVERED_CALL when no shares are held', () => {
    expect(selectStrategy('BULLISH', 60, 'HISTORICAL', true, 1.5, 'COVERED_CALL', 0)).not.toBe('COVERED_CALL');
  });

  it('requires at least 100 shares for covered calls', () => {
    expect(selectStrategy('NEUTRAL', 55, 'HISTORICAL', true, 2.5, 'ANY', 99)).toBe('CSP');
    expect(selectStrategy('NEUTRAL', 55, 'HISTORICAL', true, 2.5, 'ANY', 100)).toBe('COVERED_CALL');
  });

  it('returns PUT_CREDIT_SPREAD for BULLISH trend with sufficient IV rank', () => {
    expect(selectStrategy('BULLISH', 60, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('PUT_CREDIT_SPREAD');
  });

  it('returns CSP for neutral trend without shares', () => {
    expect(selectStrategy('NEUTRAL', 65, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('CSP');
  });

  it('returns CALL_CREDIT_SPREAD for BEARISH trend with sufficient IV rank', () => {
    expect(selectStrategy('BEARISH', 60, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('CALL_CREDIT_SPREAD');
  });

  it('earnings block takes priority over IV rank block', () => {
    expect(selectStrategy('BULLISH', 30, 'HISTORICAL', false, 1.5, 'ANY', undefined)).toBe('SKIP');
  });

  it('requires IV rank >= 65 when source is CHAIN_PROXY', () => {
    expect(selectStrategy('BULLISH', 60, 'CHAIN_PROXY', true, 1.5, 'ANY', undefined)).toBe('SKIP');
    expect(selectStrategy('BULLISH', 65, 'CHAIN_PROXY', true, 1.5, 'ANY', undefined)).toBe('PUT_CREDIT_SPREAD');
  });

  it('returns SKIP for BEARISH trend when IV rank is below threshold', () => {
    expect(selectStrategy('BEARISH', 49, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('SKIP');
  });

  it('returns CALL_DEBIT_SPREAD for BULLISH trend when IV rank is in buy zone', () => {
    expect(selectStrategy('BULLISH', 30, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('CALL_DEBIT_SPREAD');
  });

  it('returns PUT_DEBIT_SPREAD for BEARISH trend when IV rank is in buy zone', () => {
    expect(selectStrategy('BEARISH', 25, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('PUT_DEBIT_SPREAD');
  });

  it('returns SKIP for NEUTRAL trend when IV rank is in buy zone', () => {
    expect(selectStrategy('NEUTRAL', 20, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('SKIP');
  });

  it('returns SKIP when IV rank is in the neutral zone between thresholds', () => {
    expect(selectStrategy('BULLISH', 42, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('SKIP');
  });

  it('returns CALL_CREDIT_SPREAD for BEARISH trend with CHAIN_PROXY IV rank >= 65', () => {
    expect(selectStrategy('BEARISH', 65, 'CHAIN_PROXY', true, 1.5, 'ANY', undefined)).toBe('CALL_CREDIT_SPREAD');
  });

  it('returns COVERED_CALL over CALL_CREDIT_SPREAD when strategyPref is COVERED_CALL, shares held, and trend is BEARISH', () => {
    expect(selectStrategy('BEARISH', 60, 'HISTORICAL', true, 1.5, 'COVERED_CALL', 100)).toBe('COVERED_CALL');
  });
});

describe('selectCandidateStrike', () => {
  it('returns undefined for credit spreads with credit greater than spread width', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 6), putCandidate(235, 0.5)]),
      technicals,
      watchlistItem,
      'PUT_CREDIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns a positive-risk credit spread when credit is below spread width', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 2.2), putCandidate(235, 1)]),
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
      technicals,
      watchlistItem,
      'PUT_CREDIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns a call credit spread with correct metrics', () => {
    // short call strike 250 @ 2.5, long call strike 255 @ 1.0
    // credit = 1.5, width = 5, max loss = (5 - 1.5) * 100 = 350
    const candidate = selectCandidateStrike(
      optionsWithCandidates([callCandidate(250, 2.5, 0.27), callCandidate(255, 1.0, 0.15)]),
      technicals,
      watchlistItem,
      'CALL_CREDIT_SPREAD',
    );

    expect(candidate?.strategy).toBe('CALL_CREDIT_SPREAD');
    expect(candidate?.strike).toBe(250);
    expect(candidate?.longStrike).toBe(255);
    expect(candidate?.maxLoss).toBe(350);
    expect(candidate?.bpr).toBe(350);
    expect(candidate?.robpAnnualised).toBeGreaterThan(0);
  });

  it('returns undefined for call credit spread when credit exceeds spread width', () => {
    // credit 6 > width 5 — invalid
    const candidate = selectCandidateStrike(
      optionsWithCandidates([callCandidate(250, 7.0, 0.27), callCandidate(255, 1.0, 0.15)]),
      technicals,
      watchlistItem,
      'CALL_CREDIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns undefined for call credit spread when no long call exists', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidate(callCandidate(250, 2.5, 0.27)),
      technicals,
      watchlistItem,
      'CALL_CREDIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns a call debit spread with correct metrics', () => {
    // long call strike 240 @ 4.0 (delta 0.50), short call strike 245 @ 1.5 (delta 0.28)
    // net debit = 2.5, width = 5, max loss = 2.5 * 100 = 250, max profit = (5 - 2.5) * 100 = 250
    const candidate = selectCandidateStrike(
      optionsWithCandidates([callCandidate(240, 4.0, 0.5), callCandidate(245, 1.5, 0.28)]),
      technicals,
      watchlistItem,
      'CALL_DEBIT_SPREAD',
    );

    expect(candidate?.strategy).toBe('CALL_DEBIT_SPREAD');
    expect(candidate?.strike).toBe(240);
    expect(candidate?.longStrike).toBe(245);
    expect(candidate?.maxLoss).toBe(250);
    expect(candidate?.bpr).toBe(250);
    expect(candidate?.robpAnnualised).toBeGreaterThan(0);
  });

  it('returns undefined for call debit spread when net debit exceeds spread width', () => {
    // debit 6 > width 5 — invalid
    const candidate = selectCandidateStrike(
      optionsWithCandidates([callCandidate(240, 7.0, 0.5), callCandidate(245, 0.5, 0.28)]),
      technicals,
      watchlistItem,
      'CALL_DEBIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns a put debit spread with correct metrics', () => {
    // long put strike 240 @ 4.0 (delta -0.50), short put strike 235 @ 1.5 (delta -0.28)
    // net debit = 2.5, width = 5, max loss = 250
    const candidate = selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 4.0, -0.5), putCandidate(235, 1.5, -0.28)]),
      technicals,
      watchlistItem,
      'PUT_DEBIT_SPREAD',
    );

    expect(candidate?.strategy).toBe('PUT_DEBIT_SPREAD');
    expect(candidate?.strike).toBe(240);
    expect(candidate?.longStrike).toBe(235);
    expect(candidate?.maxLoss).toBe(250);
    expect(candidate?.bpr).toBe(250);
    expect(candidate?.robpAnnualised).toBeGreaterThan(0);
  });

  it('returns undefined for put debit spread when no short put exists below long put', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidate(putCandidate(240, 4.0, -0.5)),
      technicals,
      watchlistItem,
      'PUT_DEBIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });
});

describe('selectCandidateStrike sort comparators', () => {
  it('call debit spread selects long call closest to delta 0.5 when multiple qualify', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        callCandidate(238, 5.0, 0.48),
        callCandidate(240, 4.0, 0.52),
        callCandidate(245, 1.5, 0.28),
      ]),
      technicals,
      watchlistItem,
      'CALL_DEBIT_SPREAD',
    );
    // delta 0.48 and 0.52 are equidistant from 0.5; 0.52 is selected first (stable sort)
    expect(candidate?.strategy).toBe('CALL_DEBIT_SPREAD');
    expect(candidate?.robpAnnualised).toBeGreaterThan(0);
  });

  it('call debit spread selects short call closest to delta 0.3 when multiple qualify', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        callCandidate(240, 4.0, 0.5),
        callCandidate(244, 1.8, 0.25),
        callCandidate(245, 1.5, 0.28),
      ]),
      technicals,
      watchlistItem,
      'CALL_DEBIT_SPREAD',
    );
    expect(candidate?.strategy).toBe('CALL_DEBIT_SPREAD');
    expect(candidate?.longStrike).toBeDefined();
  });

  it('put debit spread selects long put closest to delta -0.5 when multiple qualify', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        putCandidate(242, 4.2, -0.48),
        putCandidate(240, 4.0, -0.52),
        putCandidate(235, 1.5, -0.28),
      ]),
      technicals,
      watchlistItem,
      'PUT_DEBIT_SPREAD',
    );
    expect(candidate?.strategy).toBe('PUT_DEBIT_SPREAD');
    expect(candidate?.robpAnnualised).toBeGreaterThan(0);
  });

  it('call credit spread selects short call closest to delta 0.27 when multiple qualify', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        callCandidate(250, 2.5, 0.26),
        callCandidate(252, 2.2, 0.28),
        callCandidate(258, 1.0, 0.15),
      ]),
      technicals,
      watchlistItem,
      'CALL_CREDIT_SPREAD',
    );
    expect(candidate?.strategy).toBe('CALL_CREDIT_SPREAD');
    expect(candidate?.strike).toBeDefined();
  });

  it('put credit spread selects short put closest to delta -0.27 when multiple qualify', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        putCandidate(238, 2.5, -0.26),
        putCandidate(236, 2.2, -0.28),
        putCandidate(232, 1.0, -0.15),
      ]),
      technicals,
      watchlistItem,
      'PUT_CREDIT_SPREAD',
    );
    expect(candidate?.strategy).toBe('PUT_CREDIT_SPREAD');
    expect(candidate?.strike).toBeDefined();
  });

  it('covered call selects call closest to delta 0.3 when multiple qualify', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        callCandidate(258, 3.0, 0.27),
        callCandidate(260, 2.4, 0.32),
      ]),
      technicals,
      { ...watchlistItem, sharesHeld: 100 },
      'COVERED_CALL',
    );
    expect(candidate?.strategy).toBe('COVERED_CALL');
    expect(candidate?.delta).toBeDefined();
  });

  it('returns undefined for covered call when no qualifying call strike exists', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([callCandidate(260, 2.4, 0.1)]),
      technicals,
      { ...watchlistItem, sharesHeld: 100 },
      'COVERED_CALL',
    );
    expect(candidate).toBeUndefined();
  });
});

describe('candidateRejectionReasons', () => {
  it('rejects missing candidates', () => {
    expect(candidateRejectionReasons(undefined, watchlistItem, false)).toEqual([
      'No mechanically valid candidate trade was found in the option chain.',
    ]);
  });

  it('rejects candidates with poor liquidity', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        { ...putCandidate(240, 2.2), openInterest: 100 },
        { ...putCandidate(235, 1), openInterest: 100 },
      ]),
      technicals,
      watchlistItem,
      'PUT_CREDIT_SPREAD',
    );

    expect(candidateRejectionReasons(candidate, watchlistItem, false)[0]).toContain(
      'Liquidity below threshold: open interest 100',
    );
  });

  it('rejects candidates below the target yield', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidate(putCandidate(220, 1.2)),
      technicals,
      watchlistItem,
      'CSP',
    );

    expect(
      candidateRejectionReasons(candidate, { ...watchlistItem, targetYieldPct: 10 }, false),
    ).toContain('Annualised yield 5.5% is below target 10.0%.');
  });

  it('rejects covered calls with ex-dividend risk inside the expiry window', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidate(callCandidate(260, 2.4, 0.3)),
      technicals,
      { ...watchlistItem, sharesHeld: 100 },
      'COVERED_CALL',
    );

    expect(
      candidateRejectionReasons(candidate, { ...watchlistItem, sharesHeld: 100 }, true),
    ).toContain('Ex-dividend date falls inside the expiry window for this covered call.');
  });
});
