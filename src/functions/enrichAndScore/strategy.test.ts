import { earningsProximity, selectStrategy } from './strategy';

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
