import { daysBetween, dateOffsetDays } from './dates';

const FIXED_NOW = '2026-01-15T00:00:00.000Z';

describe('daysBetween', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(FIXED_NOW));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a positive number for a future date', () => {
    expect(daysBetween('2026-01-20')).toBe(5);
  });

  it('returns a negative number for a past date', () => {
    expect(daysBetween('2026-01-12')).toBe(-3);
  });

  it('returns 0 for the current date', () => {
    expect(daysBetween('2026-01-15')).toBe(0);
  });
});

describe('dateOffsetDays', () => {
  it('adds positive days', () => {
    expect(dateOffsetDays('2026-01-01', 10)).toBe('2026-01-11');
  });

  it('subtracts negative days', () => {
    expect(dateOffsetDays('2026-01-15', -5)).toBe('2026-01-10');
  });

  it('crosses month boundaries', () => {
    expect(dateOffsetDays('2026-01-28', 5)).toBe('2026-02-02');
  });

  it('crosses year boundaries', () => {
    expect(dateOffsetDays('2025-12-30', 5)).toBe('2026-01-04');
  });

  it('handles zero offset', () => {
    expect(dateOffsetDays('2026-04-24', 0)).toBe('2026-04-24');
  });
});
