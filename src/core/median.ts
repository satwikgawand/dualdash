// Rolling median over a fixed window (gps-speed.md section 3.1/3.2).
// Kills single-sample GPS spikes with no model assumptions and no tuning.

/**
 * Maintain a rolling median of the last `window` values.
 * Pure state object; feed with push(), read with value().
 */
export class RollingMedian {
  private readonly buf: number[] = [];
  private readonly window: number;

  constructor(window: number) {
    if (window < 1) throw new Error('RollingMedian window must be >= 1');
    this.window = window;
  }

  push(v: number): void {
    this.buf.push(v);
    if (this.buf.length > this.window) this.buf.shift();
  }

  /** Median of the samples seen so far (up to `window`). Returns 0 when empty. */
  value(): number {
    if (this.buf.length === 0) return 0;
    const s = [...this.buf].sort((a, b) => a - b);
    const mid = s.length >> 1;
    if (s.length % 2 === 1) return s[mid];
    return (s[mid - 1] + s[mid]) / 2;
  }

  size(): number {
    return this.buf.length;
  }

  reset(): void {
    this.buf.length = 0;
  }
}
