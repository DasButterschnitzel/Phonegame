import { describe, expect, it } from 'vitest';
import { RingStats } from './frameStats.ts';

describe('RingStats', () => {
  it('summarises percentiles over the window', () => {
    const r = new RingStats(200);
    for (let i = 1; i <= 100; i++) r.push(i);
    const s = r.summary();
    expect(s.n).toBe(100);
    expect(s.median).toBe(51);
    expect(s.p95).toBe(95);
    expect(s.p99).toBe(99);
    expect(s.worst).toBe(100);
  });

  it('keeps only the most recent samples once full, and can look at a shorter tail', () => {
    const r = new RingStats(10);
    for (let i = 0; i < 25; i++) r.push(i === 24 ? 80 : 16);
    expect(r.count).toBe(10);
    expect(r.summary().worst).toBe(80);
    expect(r.summary(3).median).toBe(16);
    expect(r.last).toBe(80);
    r.clear();
    expect(r.summary()).toEqual({ n: 0, median: 0, p95: 0, p99: 0, worst: 0 });
  });
});
