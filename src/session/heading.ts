// HeadingFilter: circular smoothing for the rotating compass (SPEC M2-O4).
//
// Pure logic. Degrees must never be averaged naively: 359° and 1° average to
// 180° with plain arithmetic, but the true heading is 0°. This filter keeps
// the running heading as a 2-D unit vector (sin, cos) and blends new samples
// into the vector with a time-based exponential weight; the heading comes
// back out through atan2, which is seam-free by construction.
//
// GPS course is unreliable at low speed: below MIN_SPEED_MPS (and when the
// fix carries no heading) the filter outputs null — the UI shows "--"
// instead of noise. Suppressed stretches longer than RESEED_AFTER_SUPPRESSED_MS
// re-seed from the new sample, because a car parked long enough may have been
// turned while standing still.
//
// M2-O8: Android frequently delivers no bearing at all (hasBearing() false).
// Each sample may therefore also carry a course derived from position deltas
// (src/session/course.ts). Fusion priority is fixed: device bearing ->
// derived course -> null (suppressed). Everything else — the speed gate,
// the smoothing, the re-seed — is unchanged and treats a derived course
// exactly like a bearing. lastSuppressionReason() tells the drive-test
// overlay WHY a sample was suppressed: no source at all, or low speed.

import { HEADING } from './constants';

export interface HeadingSample {
  /** Device bearing in degrees, or null when the fix carries none. */
  headingDeg: number | null;
  /**
   * Course derived from consecutive fixes (SPEC M2-O8), or null before
   * COURSE.MIN_DERIVE_DISPLACEMENT_M of travel. Optional: samples without
   * it fuse exactly as before (bearing only).
   */
  courseDeg?: number | null;
  /** Smoothed speed in m/s (the suppression gate). */
  speedMps: number;
  /** Monotonic milliseconds. */
  tMs: number;
}

/** Why the last sample was suppressed (null while the output is live). */
export type HeadingSuppression = 'low-speed' | 'no-source' | null;

/**
 * Fusion priority (SPEC M2-O8): a finite device bearing always wins; a
 * finite derived course stands in when the bearing is missing or invalid;
 * otherwise null (the filter suppresses).
 */
export function fuseHeadingDeg(
  bearingDeg: number | null | undefined,
  courseDeg: number | null | undefined,
): number | null {
  if (typeof bearingDeg === 'number' && Number.isFinite(bearingDeg)) return bearingDeg;
  if (typeof courseDeg === 'number' && Number.isFinite(courseDeg)) return courseDeg;
  return null;
}

export class HeadingFilter {
  private sx = 0;
  private sy = 0;
  private seeded = false;
  private headingDeg: number | null = null; // smoothed result (held on suppress)
  private lastValidMs: number | null = null;
  private suppressedSinceMs: number | null = null;
  private suppressed = true;
  private reason: HeadingSuppression = null;

  /**
   * Feed one sample. Returns the smoothed heading in degrees [0, 360), or
   * null while suppressed (below speed gate / no heading or course).
   */
  push(sample: HeadingSample): number | null {
    const heading = fuseHeadingDeg(sample.headingDeg, sample.courseDeg);
    const speedOk =
      Number.isFinite(sample.speedMps) && sample.speedMps >= HEADING.MIN_SPEED_MPS;
    const usable = heading !== null && speedOk;

    // Instrumentation for the drive-test overlay (SPEC M2-O8): no source at
    // all is a different device problem from the expected low-speed hold.
    this.reason = heading === null ? 'no-source' : !speedOk ? 'low-speed' : null;

    if (!usable || heading === null) {
      if (this.suppressedSinceMs === null) this.suppressedSinceMs = sample.tMs;
      this.suppressed = true;
      return null;
    }

    const rad = (((heading % 360) + 360) % 360) * (Math.PI / 180);
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);

    const longSuppression =
      this.suppressedSinceMs !== null &&
      sample.tMs - this.suppressedSinceMs >= HEADING.RESEED_AFTER_SUPPRESSED_MS;

    if (!this.seeded || longSuppression) {
      this.sx = sin;
      this.sy = cos;
      this.seeded = true;
    } else {
      const dtMs = this.lastValidMs === null ? 0 : Math.max(0, sample.tMs - this.lastValidMs);
      const alpha = 1 - Math.exp(-dtMs / HEADING.TAU_MS);
      this.sx = (1 - alpha) * this.sx + alpha * sin;
      this.sy = (1 - alpha) * this.sy + alpha * cos;
    }

    this.lastValidMs = sample.tMs;
    this.suppressedSinceMs = null;
    this.suppressed = false;
    this.headingDeg = (Math.atan2(this.sx, this.sy) * 180) / Math.PI;
    if (this.headingDeg < 0) this.headingDeg += 360;
    return this.headingDeg;
  }

  /** Smoothed heading (held during suppression; null until first valid sample). */
  value(): number | null {
    return this.headingDeg;
  }

  /** True when the last sample was suppressed (UI shows "--"). */
  isSuppressed(): boolean {
    return this.suppressed;
  }

  /**
   * Why the last sample was suppressed: 'no-source' (no bearing and no
   * derived course) or 'low-speed' (a source existed but the gate held it).
   * Null when the last sample was accepted, or before the first push.
   */
  lastSuppressionReason(): HeadingSuppression {
    return this.reason;
  }

  reset(): void {
    this.sx = 0;
    this.sy = 0;
    this.seeded = false;
    this.headingDeg = null;
    this.lastValidMs = null;
    this.suppressedSinceMs = null;
    this.suppressed = true;
    this.reason = null;
  }
}

/**
 * Shortest angular distance between two headings in degrees (0-180).
 * Used by tests and the debug overlay; seam-safe by construction.
 */
export function headingDeltaDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
