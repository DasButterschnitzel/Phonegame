import { describe, it, expect } from 'vitest';
import { formatNumber, formatDuration } from './format.ts';

describe('formatNumber', () => {
  it('formats small and big numbers', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999.9)).toBe('999');
    expect(formatNumber(1000)).toBe('1.00K');
    expect(formatNumber(1234)).toBe('1.23K');
    expect(formatNumber(45_600_000)).toBe('45.6M');
    expect(formatNumber(1e12)).toBe('1.00T');
    expect(formatNumber(1e15)).toBe('1.00aa');
    expect(formatNumber(1e18)).toBe('1.00ab');
    expect(formatNumber(999_999)).toBe('1.00M');
  });
  it('uses decimal comma in German', () => {
    expect(formatNumber(1250, 'de')).toBe('1,25K');
  });
  it('formats durations', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
