import {
  classifyMarketTrend,
  classifyTrend,
  classifyVixRegime,
  computeAnnualisedYield,
  computeAtr,
  computeBpr,
  computeMaxLoss,
  computeMovingAverage,
  computeRobp,
} from './metrics';
import { OhlcvBar } from '../types';

const bar = (close: number, high?: number, low?: number): OhlcvBar => ({
  date: '2026-01-01',
  open: close,
  high: high ?? close,
  low: low ?? close,
  close,
  volume: 0,
});

describe('computeMovingAverage', () => {
  it('averages the last N closes', () => {
    expect(computeMovingAverage([10, 20, 30, 40, 50], 3)).toBeCloseTo(40);
  });

  it('returns the last value when array is shorter than period', () => {
    expect(computeMovingAverage([10, 20], 5)).toBe(20);
  });

  it('returns 0 for an empty array', () => {
    expect(computeMovingAverage([], 5)).toBe(0);
  });
});

describe('computeAtr', () => {
  it('returns 0 when fewer than 2 bars', () => {
    expect(computeAtr([bar(100)], 14)).toBe(0);
  });

  it('computes average true range for uniform bars', () => {
    const bars = Array.from({ length: 15 }, () => bar(100, 105, 95));
    expect(computeAtr(bars, 14)).toBeCloseTo(10);
  });
});

describe('classifyTrend', () => {
  it('returns BULLISH when price and ma20 are above ma50', () => {
    expect(classifyTrend(110, 108, 100)).toBe('BULLISH');
  });

  it('returns BEARISH when price and ma20 are below ma50', () => {
    expect(classifyTrend(90, 92, 100)).toBe('BEARISH');
  });

  it('returns NEUTRAL in mixed conditions', () => {
    expect(classifyTrend(105, 95, 100)).toBe('NEUTRAL');
  });
});

describe('classifyVixRegime', () => {
  it('returns LOW below 15', () => expect(classifyVixRegime(12)).toBe('LOW'));
  it('returns NORMAL between 15 and 25', () => expect(classifyVixRegime(20)).toBe('NORMAL'));
  it('returns ELEVATED between 25 and 35', () => expect(classifyVixRegime(30)).toBe('ELEVATED'));
  it('returns EXTREME at 35 and above', () => expect(classifyVixRegime(40)).toBe('EXTREME'));
});

describe('classifyMarketTrend', () => {
  it('returns BULL when price and ma20 are above ma50', () => {
    expect(classifyMarketTrend(110, 108, 100)).toBe('BULL');
  });

  it('returns BEAR when price and ma20 are below ma50', () => {
    expect(classifyMarketTrend(90, 92, 100)).toBe('BEAR');
  });

  it('returns NEUTRAL in mixed conditions', () => {
    expect(classifyMarketTrend(105, 95, 100)).toBe('NEUTRAL');
  });
});

describe('computeMaxLoss', () => {
  it('COVERED_CALL uses cost basis minus premium', () => {
    expect(computeMaxLoss('COVERED_CALL', { costBasis: 100, strike: 110, premiumCollected: 2 })).toBe(9800);
  });

  it('COVERED_CALL falls back to strike when no cost basis', () => {
    expect(computeMaxLoss('COVERED_CALL', { strike: 100, premiumCollected: 2 })).toBe(9800);
  });

  it('PUT_CREDIT_SPREAD uses spread width minus premium', () => {
    expect(computeMaxLoss('PUT_CREDIT_SPREAD', { spreadWidth: 5, strike: 100, premiumCollected: 1 })).toBe(400);
  });

  it('CSP uses strike minus premium', () => {
    expect(computeMaxLoss('CSP', { strike: 100, premiumCollected: 2 })).toBe(9800);
  });
});

describe('computeBpr', () => {
  it('COVERED_CALL BPR is share price * 100', () => {
    expect(computeBpr('COVERED_CALL', 150, 5000)).toBe(15000);
  });

  it('CSP BPR equals max loss', () => {
    expect(computeBpr('CSP', 150, 9800)).toBe(9800);
  });
});

describe('computeRobp', () => {
  it('annualises return on buying power', () => {
    expect(computeRobp(1, 100, 30)).toBeCloseTo((1 / 100) * (365 / 30) * 100);
  });

  it('returns 0 when BPR is zero', () => {
    expect(computeRobp(1, 0, 30)).toBe(0);
  });
});

describe('computeAnnualisedYield', () => {
  it('annualises premium yield', () => {
    expect(computeAnnualisedYield(1, 100, 30)).toBeCloseTo((1 / 10000) * (365 / 30) * 100);
  });

  it('returns 0 when strike is zero', () => {
    expect(computeAnnualisedYield(1, 0, 30)).toBe(0);
  });

  it('returns 0 when DTE is zero', () => {
    expect(computeAnnualisedYield(1, 100, 0)).toBe(0);
  });
});
