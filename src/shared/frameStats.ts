/** Summary of a window of frame samples (milliseconds). */
export interface FrameSummary {
  n: number;
  median: number;
  p95: number;
  p99: number;
  /** Worst sample in the window. */
  worst: number;
}

/**
 * Fixed-size ring of samples with percentile summaries. Pushing never allocates; summarising sorts a scratch copy, so
 * call it a few times per second at most (perf overlay, tests), not per frame.
 */
export class RingStats {
  private buf: Float32Array;
  private scratch: Float32Array;
  private next = 0;
  private filled = 0;

  constructor(size = 600) {
    this.buf = new Float32Array(size);
    this.scratch = new Float32Array(size);
  }

  push(v: number): void {
    this.buf[this.next] = v;
    this.next = (this.next + 1) % this.buf.length;
    if (this.filled < this.buf.length) this.filled++;
  }

  clear(): void {
    this.next = 0;
    this.filled = 0;
  }

  get count(): number {
    return this.filled;
  }

  /** Most recent sample (0 when empty). */
  get last(): number {
    return this.filled ? this.buf[(this.next - 1 + this.buf.length) % this.buf.length] : 0;
  }

  /** Percentiles over the last `n` samples (default: everything held). */
  summary(n = this.filled): FrameSummary {
    const k = Math.min(n, this.filled);
    if (k === 0) return { n: 0, median: 0, p95: 0, p99: 0, worst: 0 };
    const s = this.scratch.subarray(0, k);
    for (let i = 0; i < k; i++) s[i] = this.buf[(this.next - 1 - i + this.buf.length * 2) % this.buf.length];
    s.sort();
    const at = (p: number) => s[Math.min(k - 1, Math.floor(p * (k - 1) + 0.5))];
    return { n: k, median: at(0.5), p95: at(0.95), p99: at(0.99), worst: s[k - 1] };
  }
}
