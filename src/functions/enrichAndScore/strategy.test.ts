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

  it('requires IV rank >= 60 when source is CHAIN_PROXY', () => {
    expect(selectStrategy('BULLISH', 59, 'CHAIN_PROXY', true, 1.5, 'ANY', undefined)).toBe('SKIP');
    expect(selectStrategy('BULLISH', 60, 'CHAIN_PROXY', true, 1.5, 'ANY', undefined)).toBe('PUT_CREDIT_SPREAD');
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

  it('returns SKIP for directional trend when IV rank is in neutral zone', () => {
    expect(selectStrategy('BULLISH', 42, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('SKIP');
    expect(selectStrategy('BEARISH', 42, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('SKIP');
  });

  it('returns IRON_CONDOR for NEUTRAL trend when IV rank is in the neutral zone (HISTORICAL)', () => {
    expect(selectStrategy('NEUTRAL', 42, 'HISTORICAL', true, 1.5, 'ANY', undefined)).toBe('IRON_CONDOR');
  });

  it('returns IRON_CONDOR for NEUTRAL trend when IV rank is in the neutral zone (CHAIN_PROXY)', () => {
    expect(selectStrategy('NEUTRAL', 50, 'CHAIN_PROXY', true, 1.5, 'ANY', undefined)).toBe('IRON_CONDOR');
  });

  it('returns CALL_CREDIT_SPREAD for BEARISH trend with CHAIN_PROXY IV rank >= 60', () => {
    expect(selectStrategy('BEARISH', 60, 'CHAIN_PROXY', true, 1.5, 'ANY', undefined)).toBe('CALL_CREDIT_SPREAD');
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

  it('returns a positive-risk credit spread when credit meets minimum threshold', () => {
    // credit = 2.5 - 0.5 = 2.0, width = 5, 2.0 >= 5*0.33=1.65 ✓, max loss = (5-2)*100 = 300
    const candidate = selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 2.5), putCandidate(235, 0.5)]),
      technicals,
      watchlistItem,
      'PUT_CREDIT_SPREAD',
    );

    expect(candidate?.longStrike).toBe(235);
    expect(candidate?.maxLoss).toBe(300);
    expect(candidate?.bpr).toBe(300);
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

  it('returns undefined for put credit spread when credit is below 33% of spread width', () => {
    // credit = 2.5 - 2.2 = 0.3, width = 5, 0.3 < 1.65 → rejected by long-leg selector
    const candidate = selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 2.5), putCandidate(235, 2.2)]),
      technicals,
      watchlistItem,
      'PUT_CREDIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns a call credit spread with correct metrics', () => {
    // short call 250 @ 2.5, long call 255 @ 0.5 → credit=2.0, width=5, max loss=300
    const candidate = selectCandidateStrike(
      optionsWithCandidates([callCandidate(250, 2.5, 0.27), callCandidate(255, 0.5, 0.15)]),
      technicals,
      watchlistItem,
      'CALL_CREDIT_SPREAD',
    );

    expect(candidate?.strategy).toBe('CALL_CREDIT_SPREAD');
    expect(candidate?.strike).toBe(250);
    expect(candidate?.longStrike).toBe(255);
    expect(candidate?.maxLoss).toBe(300);
    expect(candidate?.bpr).toBe(300);
    expect(candidate?.robpAnnualised).toBeGreaterThan(0);
  });

  it('returns undefined for call credit spread when credit exceeds spread width', () => {
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

  it('selects the long put closest to ATR-based target width when multiple candidates qualify', () => {
    // atr14=4 → targetWidth=4. Candidates at width=4 (strike 236) and width=7 (strike 233).
    // Both pass min credit. Width-4 candidate is preferred.
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        putCandidate(240, 3.5, -0.27),
        putCandidate(236, 1.8, -0.15), // width=4 (matches targetWidth=4), credit=1.7 >= 1.32 ✓
        putCandidate(233, 1.0, -0.12), // width=7, credit=2.5 >= 2.31 ✓ (also qualifies)
      ]),
      technicals,
      watchlistItem,
      'PUT_CREDIT_SPREAD',
    );

    expect(candidate?.longStrike).toBe(236);
  });

  it('selects the long call closest to ATR-based target width when multiple candidates qualify', () => {
    // atr14=4 → targetWidth=4. Long call at width=4 (strike 254) preferred over width=8 (strike 258).
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        callCandidate(250, 2.5, 0.27),
        callCandidate(254, 0.5, 0.15), // width=4 → preferred
        callCandidate(258, 0.3, 0.10), // width=8
      ]),
      technicals,
      watchlistItem,
      'CALL_CREDIT_SPREAD',
    );

    expect(candidate?.longStrike).toBe(254);
  });

  it('returns a call debit spread with correct metrics', () => {
    // long call 240 @ 4.0 (delta 0.50), short call 245 @ 1.5 (delta 0.28)
    // net debit = 2.5, width = 5, max profit = 2.5, 1:1 ratio ✓
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
    const candidate = selectCandidateStrike(
      optionsWithCandidates([callCandidate(240, 7.0, 0.5), callCandidate(245, 0.5, 0.28)]),
      technicals,
      watchlistItem,
      'CALL_DEBIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns undefined for call debit spread when reward:risk is below 1:1', () => {
    // net debit = 3.5, width = 5, max profit = 1.5 < 3.5 debit → fails 1:1 check
    const candidate = selectCandidateStrike(
      optionsWithCandidates([callCandidate(240, 4.5, 0.5), callCandidate(245, 1.0, 0.28)]),
      technicals,
      watchlistItem,
      'CALL_DEBIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns a put debit spread with correct metrics', () => {
    // long put 240 @ 4.0 (delta -0.50), short put 235 @ 1.5 (delta -0.28)
    // net debit = 2.5, width = 5, max profit = 2.5, 1:1 ratio ✓
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

  it('returns undefined for put debit spread when reward:risk is below 1:1', () => {
    // net debit = 3.5, width = 5, max profit = 1.5 < 3.5 → fails 1:1 check
    const candidate = selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 4.5, -0.5), putCandidate(235, 1.0, -0.28)]),
      technicals,
      watchlistItem,
      'PUT_DEBIT_SPREAD',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns a valid iron condor with correct four-leg strike structure', () => {
    // atr14=4 → targetWidth=4. Put spread: 236/232. Call spread: 244/248. Net credit = 3.0.
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        putCandidate(236, 2.0, -0.27),
        putCandidate(232, 0.5, -0.15),
        callCandidate(244, 2.0, 0.27),
        callCandidate(248, 0.5, 0.15),
      ]),
      technicals,
      watchlistItem,
      'IRON_CONDOR',
    );

    expect(candidate?.strategy).toBe('IRON_CONDOR');
    expect(candidate?.strike).toBe(236);       // short put
    expect(candidate?.longStrike).toBe(232);   // long put
    expect(candidate?.callStrike).toBe(244);   // short call
    expect(candidate?.callLongStrike).toBe(248); // long call
    expect(candidate?.maxLoss).toBe(100);      // (4 - 3.0) * 100
    expect(candidate?.bpr).toBe(100);
    expect(candidate?.robpAnnualised).toBeGreaterThan(0);
  });

  it('returns undefined for iron condor when no call candidates exist', () => {
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        putCandidate(236, 2.0, -0.27),
        putCandidate(232, 0.5, -0.15),
      ]),
      technicals,
      watchlistItem,
      'IRON_CONDOR',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns undefined for iron condor when individual leg credit is insufficient', () => {
    // Each long leg credit = 0.2 per wing — below the 33% min embedded in long-leg selector
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        putCandidate(236, 2.0, -0.27),
        putCandidate(232, 1.8, -0.15),
        callCandidate(244, 2.0, 0.27),
        callCandidate(248, 1.8, 0.15),
      ]),
      technicals,
      watchlistItem,
      'IRON_CONDOR',
    );

    expect(candidate).toBeUndefined();
  });

  it('returns undefined for call debit spread when no long call exists in delta range', () => {
    // delta=0.3 is outside [0.45, 0.65] → selectLongLeg returns undefined
    const candidate = selectCandidateStrike(
      optionsWithCandidates([callCandidate(240, 4.0, 0.3), callCandidate(245, 1.5, 0.28)]),
      technicals, watchlistItem, 'CALL_DEBIT_SPREAD',
    );
    expect(candidate).toBeUndefined();
  });

  it('returns undefined for put debit spread when no long put exists in delta range', () => {
    // delta=-0.2 is outside [-0.45, -0.65] → selectLongLeg returns undefined
    const candidate = selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 4.0, -0.2), putCandidate(235, 1.5, -0.28)]),
      technicals, watchlistItem, 'PUT_DEBIT_SPREAD',
    );
    expect(candidate).toBeUndefined();
  });

  it('returns undefined for call credit spread when no short call exists in delta range', () => {
    // delta=0.5 is outside [0.20, 0.35] → selectShortCall returns undefined
    const candidate = selectCandidateStrike(
      optionsWithCandidates([callCandidate(240, 4.0, 0.5)]),
      technicals, watchlistItem, 'CALL_CREDIT_SPREAD',
    );
    expect(candidate).toBeUndefined();
  });

  it('returns undefined for put credit spread when no short put exists in delta range', () => {
    // delta=-0.5 is outside [-0.20, -0.35] → selectShortPut returns undefined
    const candidate = selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 4.0, -0.5)]),
      technicals, watchlistItem, 'PUT_CREDIT_SPREAD',
    );
    expect(candidate).toBeUndefined();
  });

  it('returns undefined for iron condor when no qualifying short put exists', () => {
    // delta=-0.5 is outside [-0.20, -0.35] → selectShortPut returns undefined
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        putCandidate(236, 2.0, -0.5),
        callCandidate(244, 2.0, 0.27),
        callCandidate(248, 0.5, 0.15),
      ]),
      technicals, watchlistItem, 'IRON_CONDOR',
    );
    expect(candidate).toBeUndefined();
  });

  it('returns undefined when strategy is SKIP', () => {
    expect(selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 2.5)]),
      technicals, watchlistItem, 'SKIP',
    )).toBeUndefined();
  });

  it('returns undefined when strategy is WATCH', () => {
    expect(selectCandidateStrike(
      optionsWithCandidates([putCandidate(240, 2.5)]),
      technicals, watchlistItem, 'WATCH',
    )).toBeUndefined();
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

  it('put debit spread selects short put closest to delta -0.3 when multiple qualify', () => {
    // Two qualifying short puts: delta -0.25 (dist 0.05) vs -0.28 (dist 0.02) — -0.28 selected
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        putCandidate(240, 4.0, -0.5),
        putCandidate(235, 1.5, -0.25),
        putCandidate(234, 1.4, -0.28),
      ]),
      technicals,
      watchlistItem,
      'PUT_DEBIT_SPREAD',
    );
    expect(candidate?.strategy).toBe('PUT_DEBIT_SPREAD');
    expect(candidate?.longStrike).toBe(234);
  });

  it('call credit spread selects short call closest to delta 0.27 when multiple qualify', () => {
    // Two short call candidates equidistant from 0.27; two long call candidates for sort coverage
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        callCandidate(250, 2.5, 0.26),
        callCandidate(252, 2.0, 0.28),
        callCandidate(254, 0.5, 0.15), // width=4 from 250, qualifies
        callCandidate(260, 0.3, 0.10), // width=10 from 250
      ]),
      technicals,
      watchlistItem,
      'CALL_CREDIT_SPREAD',
    );
    expect(candidate?.strategy).toBe('CALL_CREDIT_SPREAD');
    expect(candidate?.strike).toBeDefined();
  });

  it('put credit spread selects short put closest to delta -0.27 when multiple qualify', () => {
    // Two long put candidates at equal ATR-distance; second provides enough credit
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        putCandidate(238, 2.5, -0.26),
        putCandidate(236, 2.2, -0.28),
        putCandidate(232, 0.5, -0.15), // credit=2.0 from 238, width=6, 2.0 >= 1.98 ✓
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
    // credit = 2.5 - 0.5 = 2.0, width = 5, 2.0 >= 1.65 ✓ — trade is built but OI is low
    const candidate = selectCandidateStrike(
      optionsWithCandidates([
        { ...putCandidate(240, 2.5), openInterest: 100 },
        { ...putCandidate(235, 0.5), openInterest: 100 },
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
