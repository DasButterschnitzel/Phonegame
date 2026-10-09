import { describe, expect, it } from 'vitest';
import { MAX_VERSION_CODE, highestTagged, versionCode } from './version.ts';

describe('versionCode', () => {
  it('maps semantic versions to increasing codes', () => {
    expect(versionCode('0.1.0')).toBe(10_000);
    expect(versionCode('1.2.3', 4)).toBe(1_020_304);
    const order = [
      ['0.1.0', 0],
      ['0.1.0', 1],
      ['0.1.1', 0],
      ['0.2.0', 0],
      ['0.99.99', 99],
      ['1.0.0', 0],
      ['2.0.0', 0],
    ] as const;
    const codes = order.map(([v, b]) => versionCode(v, b));
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('refuses what cannot be ordered or uploaded', () => {
    expect(() => versionCode('1.2')).toThrow();
    expect(() => versionCode('1.2.3-beta')).toThrow();
    expect(() => versionCode('1.100.0')).toThrow();
    expect(() => versionCode('1.0.100')).toThrow();
    expect(() => versionCode('1.0.0', 100)).toThrow();
    expect(() => versionCode('1.0.0', -1)).toThrow();
    expect(() => versionCode('0.0.0')).toThrow();
    expect(versionCode('2100.0.0')).toBe(MAX_VERSION_CODE);
    expect(() => versionCode('2100.0.1')).toThrow();
    expect(versionCode('2099.99.99', 99)).toBeLessThanOrEqual(MAX_VERSION_CODE);
  });

  it('finds the highest production tag', () => {
    expect(highestTagged([])).toBe(0);
    expect(highestTagged(['v1.0.0', 'play-10000', 'play-10100', 'play-9999', 'play-x', ''])).toBe(10_100);
  });
});
