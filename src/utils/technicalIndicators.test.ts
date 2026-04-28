import { classifyTrend, computeHistoricalVolatility, computeMovingAverage, computeAtr } from './technicalIndicators';

describe('computeMovingAverage', () => {
  it('returns the correct average for exactly period elements', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1); // [1..20], mean = 10.5
    expect(computeMovingAverage(closes, 20)).toBeCloseTo(10.5);
  });

  it('uses only the last `period` elements when the array is longer', () => {
    // First 10 elements are 0; last 20 are all 5 — average of last 20 = 5
    const closes = [...Array(10).fill(0), ...Array(20).fill(5)];
    expect(computeMovingAverage(closes, 20)).toBeCloseTo(5);
  });

  it('returns undefined when the array has fewer elements than the period', () => {
    // Regression: fetching only 60 calendar days (~41 trading days) made MA50 always
    // undefined, locking classifyMarketTrend into NEUTRAL permanently.
    expect(computeMovingAverage(Array(41).fill(100), 50)).toBeUndefined();
  });

  it('returns a value when the array has exactly as many elements as the period', () => {
    expect(computeMovingAverage(Array(50).fill(100), 50)).toBe(100);
  });

  it('returns undefined for an empty array', () => {
    expect(computeMovingAverage([], 20)).toBeUndefined();
  });
});

describe('classifyTrend', () => {
  it('returns BULLISH when price is above MA50 and MA20 is above MA50', () => {
    expect(classifyTrend(110, 105, 100)).toBe('BULLISH');
  });

  it('returns BEARISH when price is below MA50 and MA20 is below MA50', () => {
    expect(classifyTrend(90, 95, 100)).toBe('BEARISH');
  });

  it('returns NEUTRAL when price is above MA50 but MA20 is below MA50', () => {
    expect(classifyTrend(110, 95, 100)).toBe('NEUTRAL');
  });

  it('returns undefined when MA20 is undefined — mirrors the insufficient-bar scenario', () => {
    // Regression: when the lookback window was only 60 calendar days, MA50 was always
    // undefined, so classifyTrend always returned undefined and selectStrategy skipped
    // every ticker regardless of market conditions.
    expect(classifyTrend(110, undefined, 100)).toBeUndefined();
  });

  it('returns undefined when MA50 is undefined', () => {
    expect(classifyTrend(110, 105, undefined)).toBeUndefined();
  });

  it('returns undefined when both MAs are undefined', () => {
    expect(classifyTrend(110, undefined, undefined)).toBeUndefined();
  });
});

describe('computeAtr', () => {
  it('returns 0 for fewer than 2 bars', () => {
    expect(computeAtr([])).toBe(0);
    expect(computeAtr([{ date: '2026-01-01', open: 100, high: 105, low: 95, close: 100, volume: 1000 }])).toBe(0);
  });

  it('computes a simple true range when close-to-close gaps are small', () => {
    const bars = [
      { date: '2026-01-01', open: 100, high: 105, low: 95, close: 100, volume: 1000 },
      { date: '2026-01-02', open: 100, high: 110, low: 98, close: 108, volume: 1000 },
    ];
    // True range = max(110-98, |110-100|, |98-100|) = max(12, 10, 2) = 12
    expect(computeAtr(bars, 1)).toBeCloseTo(12);
  });
});

describe('computeHistoricalVolatility', () => {
  it('returns 0 for fewer than 2 closes', () => {
    expect(computeHistoricalVolatility([])).toBe(0);
    expect(computeHistoricalVolatility([100])).toBe(0);
  });

  it('returns 0 for a flat price series', () => {
    const closes = Array(31).fill(100);
    expect(computeHistoricalVolatility(closes, 30)).toBe(0);
  });

  it('returns a positive annualised percentage for a moving price series', () => {
    // Alternating 100/101 gives a non-zero log-return series
    const closes = Array.from({ length: 31 }, (_, i) => (i % 2 === 0 ? 100 : 101));
    expect(computeHistoricalVolatility(closes, 30)).toBeGreaterThan(0);
  });
});
