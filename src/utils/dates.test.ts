import { daysBetween, dateOffsetDays, resolveApiDate } from './dates';

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

  it('returns days relative to referenceDate, not wall-clock time', () => {
    // Wall clock is 2026-01-15. referenceDate is 2026-01-10, so target is 5 days ahead of ref.
    expect(daysBetween('2026-01-15', '2026-01-10')).toBe(5);
  });

  it('returns a negative number when target is before referenceDate', () => {
    expect(daysBetween('2026-01-08', '2026-01-10')).toBe(-2);
  });

  it('is not affected by wall-clock time when referenceDate is supplied', () => {
    // Supplying a past referenceDate gives a completely different result than now-relative.
    // Without referenceDate: 2026-01-20 is 5 days from now (2026-01-15).
    // With referenceDate=2026-01-01: 2026-01-20 is 19 days from the reference.
    expect(daysBetween('2026-01-20', '2026-01-01')).toBe(19);
    expect(daysBetween('2026-01-20')).toBe(5);
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

describe('resolveApiDate', () => {
  it('returns the input unchanged when it is a valid YYYY-MM-DD date', () => {
    expect(resolveApiDate('2026-04-25')).toBe('2026-04-25');
  });

  it('falls back to today when the input is not a valid date string', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-25T00:00:00.000Z'));
    expect(resolveApiDate('today')).toBe('2026-04-25');
    expect(resolveApiDate('')).toBe('2026-04-25');
    jest.useRealTimers();
  });
});
