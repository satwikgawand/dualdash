// MockSpeedSource: a synthetic fix generator for browser dev and unit tests.
// Drives the same SpeedSource seam with a controllable trace so the UI and
// pipeline run without hardware. Also used to simulate tunnels (a gap with no
// fixes) and jitter-at-rest.

import { FixListener, SpeedSource } from './SpeedSource';
import { RawFix } from '../core/types';

const NS_PER_MS = 1_000_000;

/** A scripted point on a mock trace. */
export interface MockPoint {
  /** Offset from trace start, in milliseconds. */
  tMs: number;
  speedMps: number;
  hasSpeed?: boolean;
  lat?: number;
  lon?: number;
  accuracyM?: number;
  headingDeg?: number;
}

export class MockSpeedSource implements SpeedSource {
  private listeners = new Set<FixListener>();
  private active = false;
  private timer: number | null = null;
  private startedAt = 0;

  constructor(private trace: MockPoint[]) {}

  setTrace(trace: MockPoint[]): void {
    this.trace = trace;
  }

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.startedAt = performance.now();
    // Emit each trace point at its offset.
    for (const p of this.trace) {
      const delay = Math.max(0, p.tMs - (performance.now() - this.startedAt));
      window.setTimeout(() => {
        if (!this.active) return;
        this.emit(p);
      }, delay);
    }
  }

  stop(): void {
    this.active = false;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  onFix(cb: FixListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  isActive(): boolean {
    return this.active;
  }

  private emit(p: MockPoint): void {
    const monoNs = BigInt(Math.round(p.tMs * NS_PER_MS));
    const fix: RawFix = {
      speedMps: p.speedMps,
      hasSpeed: p.hasSpeed !== false,
      accuracyM: p.accuracyM ?? 5,
      speedAccuracyMps: 1,
      hasSpeedAccuracy: true,
      lat: p.lat ?? 0,
      lon: p.lon ?? 0,
      elapsedRealtimeNanos: monoNs,
      headingDeg: p.headingDeg ?? 0,
    };
    for (const cb of this.listeners) cb(fix);
  }
}
