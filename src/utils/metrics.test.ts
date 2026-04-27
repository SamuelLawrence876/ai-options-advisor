import {
  classifyTrend,
  computeAtr,
  computeHistoricalVolatility,
  computeMovingAverage,
} from './technicalIndicators';
import { classifyMarketTrend, classifyVixRegime } from './marketRegime';
import { computeIvRank } from './impliedVolatility';
import { computeAnnualisedYield, computeBpr, computeMaxLoss, computeRobp } from './optionRisk';
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
  it('returns 0 for empty bar array', () => {
    expect(computeAtr([], 14)).toBe(0);
  });

  it('returns 0 when fewer than 2 bars', () => {
    expect(computeAtr([bar(100)], 14)).toBe(0);
  });

  it('uses default period of 14 when no period is supplied', () => {
    const bars = Array.from({ length: 15 }, () => bar(100, 105, 95));
    expect(computeAtr(bars)).toBeCloseTo(10);
  });

  it('computes average true range for uniform bars', () => {
    const bars = Array.from({ length: 15 }, () => bar(100, 105, 95));
    expect(computeAtr(bars, 14)).toBeCloseTo(10);
  });
});

describe('computeHistoricalVolatility', () => {
  it('annualises log-return volatility', () => {
    const closes = [100, 101, 99, 102, 103, 101, 104, 105, 103, 106, 107, 108];
    expect(computeHistoricalVolatility(closes, 10)).toBeGreaterThan(0);
  });

  it('returns 0 for empty closes array', () => {
    expect(computeHistoricalVolatility([], 30)).toBe(0);
  });

  it('returns 0 when there are not enough returns', () => {
    expect(computeHistoricalVolatility([100], 30)).toBe(0);
  });

  it('uses default period of 30 when no period is supplied', () => {
    const closes = Array.from({ length: 35 }, (_, i) => 100 + i);
    expect(computeHistoricalVolatility(closes)).toBeGreaterThan(0);
  });

  it('returns 0 when all closes are zero (no valid log returns)', () => {
    expect(computeHistoricalVolatility([0, 0, 0, 0, 0], 3)).toBe(0);
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
    expect(
      computeMaxLoss('COVERED_CALL', { costBasis: 100, strike: 110, premiumCollected: 2 }),
    ).toBe(9800);
  });

  it('COVERED_CALL falls back to strike when no cost basis', () => {
    expect(computeMaxLoss('COVERED_CALL', { strike: 100, premiumCollected: 2 })).toBe(9800);
  });

  it('PUT_CREDIT_SPREAD uses spread width minus premium', () => {
    expect(
      computeMaxLoss('PUT_CREDIT_SPREAD', { spreadWidth: 5, strike: 100, premiumCollected: 1 }),
    ).toBe(400);
  });

  it('PUT_CREDIT_SPREAD does not return negative max loss for invalid credits', () => {
    expect(
      computeMaxLoss('PUT_CREDIT_SPREAD', { spreadWidth: 5, strike: 100, premiumCollected: 6 }),
    ).toBe(0);
  });

  it('CALL_CREDIT_SPREAD uses spread width minus premium', () => {
    expect(
      computeMaxLoss('CALL_CREDIT_SPREAD', { spreadWidth: 5, strike: 100, premiumCollected: 1 }),
    ).toBe(400);
  });

  it('PUT_CREDIT_SPREAD falls back to default spread width of 5 when not provided', () => {
    expect(
      computeMaxLoss('PUT_CREDIT_SPREAD', { strike: 100, premiumCollected: 1 }),
    ).toBe(400);
  });

  it('CALL_CREDIT_SPREAD does not return negative max loss for invalid credits', () => {
    expect(
      computeMaxLoss('CALL_CREDIT_SPREAD', { spreadWidth: 5, strike: 100, premiumCollected: 6 }),
    ).toBe(0);
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

  it('CALL_CREDIT_SPREAD BPR equals max loss', () => {
    expect(computeBpr('CALL_CREDIT_SPREAD', 150, 400)).toBe(400);
  });

  it('PUT_CREDIT_SPREAD BPR equals max loss', () => {
    expect(computeBpr('PUT_CREDIT_SPREAD', 150, 400)).toBe(400);
  });

  it('CALL_DEBIT_SPREAD max loss equals net debit times 100', () => {
    expect(computeMaxLoss('CALL_DEBIT_SPREAD', { strike: 240, premiumCollected: 2.5 })).toBe(250);
  });

  it('PUT_DEBIT_SPREAD max loss equals net debit times 100', () => {
    expect(computeMaxLoss('PUT_DEBIT_SPREAD', { strike: 240, premiumCollected: 2.5 })).toBe(250);
  });

  it('CALL_DEBIT_SPREAD BPR equals max loss', () => {
    expect(computeBpr('CALL_DEBIT_SPREAD', 150, 250)).toBe(250);
  });

  it('PUT_DEBIT_SPREAD BPR equals max loss', () => {
    expect(computeBpr('PUT_DEBIT_SPREAD', 150, 250)).toBe(250);
  });

  it('IRON_CONDOR uses spread width minus premium', () => {
    expect(computeMaxLoss('IRON_CONDOR', { spreadWidth: 4, strike: 236, premiumCollected: 3 })).toBe(100);
  });

  it('SKIP strategy returns 0 for max loss', () => {
    expect(computeMaxLoss('SKIP', { strike: 100, premiumCollected: 1 })).toBe(0);
  });

  it('IRON_CONDOR BPR equals max loss', () => {
    expect(computeBpr('IRON_CONDOR', 150, 100)).toBe(100);
  });

  it('WATCH strategy returns max loss for BPR', () => {
    expect(computeBpr('WATCH', 150, 500)).toBe(500);
  });
});

describe('computeRobp', () => {
  it('annualises return on buying power', () => {
    expect(computeRobp(1, 100, 30)).toBeCloseTo((100 / 100) * (365 / 30) * 100);
  });

  it('returns 0 when BPR is zero', () => {
    expect(computeRobp(1, 0, 30)).toBe(0);
  });

  it('returns 0 when BPR is negative', () => {
    expect(computeRobp(1, -100, 30)).toBe(0);
  });
});

describe('computeAnnualisedYield', () => {
  it('annualises premium yield', () => {
    expect(computeAnnualisedYield(1, 100, 30)).toBeCloseTo((1 / 100) * (365 / 30) * 100);
  });

  it('returns 0 when strike is zero', () => {
    expect(computeAnnualisedYield(1, 0, 30)).toBe(0);
  });

  it('returns 0 when DTE is zero', () => {
    expect(computeAnnualisedYield(1, 100, 0)).toBe(0);
  });
});

describe('computeIvRank', () => {
  it('computes rank against historical IV range', () => {
    expect(computeIvRank(30, [10, 20, 30, 40, 50])).toBe(50);
  });

  it('clamps values outside historical range', () => {
    expect(computeIvRank(60, [10, 20, 30, 40, 50])).toBe(100);
    expect(computeIvRank(5, [10, 20, 30, 40, 50])).toBe(0);
  });

  it('returns undefined when history is insufficient', () => {
    expect(computeIvRank(30, [10, 20, 30, 40])).toBeUndefined();
  });

  it('returns 100 when all historical IVs are the same and current IV is at that level', () => {
    expect(computeIvRank(30, [30, 30, 30, 30, 30])).toBe(100);
  });

  it('returns 0 when all historical IVs are the same and current IV is below', () => {
    expect(computeIvRank(20, [30, 30, 30, 30, 30])).toBe(0);
  });
});
