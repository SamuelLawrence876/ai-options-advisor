import { deriveAnalystConsensus } from './analystConsensus';

describe('deriveAnalystConsensus', () => {
  it('returns N/A when no analysts', () => {
    expect(deriveAnalystConsensus(0, 0, 0)).toBe('N/A');
  });

  it('returns Buy when buys outnumber holds + sells', () => {
    expect(deriveAnalystConsensus(10, 3, 1)).toBe('Buy');
  });

  it('returns Sell when sells outnumber buys + holds', () => {
    expect(deriveAnalystConsensus(1, 2, 10)).toBe('Sell');
  });

  it('returns Hold when no clear majority', () => {
    expect(deriveAnalystConsensus(5, 5, 5)).toBe('Hold');
  });

  it('returns Hold when buys equal sells and no holds', () => {
    expect(deriveAnalystConsensus(5, 0, 5)).toBe('Hold');
  });

  it('Buy requires strict majority over combined holds and sells', () => {
    expect(deriveAnalystConsensus(5, 3, 3)).toBe('Hold');
    expect(deriveAnalystConsensus(7, 3, 3)).toBe('Buy');
  });
});
