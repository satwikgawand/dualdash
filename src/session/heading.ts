// HeadingFilter: circular smoothing for the rotating compass (SPEC M2-O4).
//
// Pure logic. Degrees must never be averaged naively: 359° and 1° average to
// 180° with plain arithmetic, but the true heading is 0°. This filter keeps
// the running heading as a 2-D unit vector (sin, cos) and blends new samples
// into the vector with a time-based exponential weight; the heading comes
// back out through atan2, which is seam-free by construction.
//
// Sources (SPEC M2-O8 + M2-O9). Each sample may carry three headings:
//   - headingDeg   the provider bearing (coords.heading), often null,
//   - courseDeg    the course derived from consecutive fixes (M2-O8),
//   - orientationDeg  the phone's own compass (M2-O9).
//
// M2-O9 fusion semantics (amends the M2-O8 line — see the SPEC amendment):
//   moving (>= MIN_SPEED_MPS): derived course > provider bearing >
//                              orientation > null  — direction of travel
//                              wins for a HUD, and a stuck provider bearing
//                              (H2) cannot peg the tape at North while the
//                              course moves.
//   stationary (< gate):       orientation > null — at rest the GPS course
//                              is noise, so the ONLY honest source is the
//                              phone's own compass. No compass, no heading:
//                              the tape shows the dimmed idle, never a fake
//                              heading.
// The stuck-bearing guard (StuckBearingGuard below) additionally withdraws
// a bearing that has held one value for > 30 s while the derived course
// turned >= 20° in that window: such a bearing is proven stale, so it is
// never trusted again while it stays stuck — even if the course drops out,
// the tape holds instead of snapping to a stale North.
//
// Everything else — the speed gate for GPS sources, the smoothing, the
// re-seed — is unchanged and treats a derived course exactly like a bearing.
// lastSuppressionReason() tells the drive-test overlay WHY a sample was
// suppressed: no source at all, the gate holding a GPS source, or a missing
// compass while parked (M2-O9).

import { HEADING } from './constants';

export interface HeadingSample {
  /** Provider bearing in degrees, or null when the fix carries none. */
  headingDeg: number | null;
  /**
   * Course derived from consecutive fixes (SPEC M2-O8), or null before
   * COURSE.MIN_DERIVE_DISPLACEMENT_M of travel. Optional: samples without
   * it fuse exactly as before (bearing only).
   */
  courseDeg?: number | null;
  /**
   * Phone compass heading (SPEC M2-O9), or null when the sensor is
   * unavailable / denied / stale. `undefined` means the sample carries no
   * compass state at all — pre-M2-O9 callers — and keeps the old reasons.
   */
  orientationDeg?: number | null;
  /** Smoothed speed in m/s (the suppression gate). */
  speedMps: number;
  /** Monotonic milliseconds. */
  tMs: number;
}

/** Why the last sample was suppressed (null while the output is live). */
export type HeadingSuppression = 'low-speed' | 'no-source' | 'no-compass' | null;

/** Which source the tape is following (M2-O9: overlay + tests). */
export type HeadingSource = 'course' | 'bearing' | 'orientation' | null;

/** True for a usable heading value: a finite number, not null/undefined/NaN. */
function finite(deg: number | null | undefined): deg is number {
  return typeof deg === 'number' && Number.isFinite(deg);
}

/**
 * First finite source wins (SPEC M2-O9). The PRIORITY is the caller's: it is
 * the argument order. M2-O8 fused a bearing with its course as
 * `fuseHeadingDeg(bearing, course)` — bearing first — and that two-argument
 * call still behaves exactly as it did; M2-O9 moving fusion passes
 * `fuseHeadingDeg(course, bearing, orientation)`, and stationary passes the
 * compass alone.
 */
export function fuseHeadingDeg(
  ...sources: Array<number | null | undefined>
): number | null {
  for (const s of sources) if (finite(s)) return s;
  return null;
}

/**
 * Stuck-bearing guard (SPEC M2-O9, hypothesis H2).
 *
 * The overlay's `raw heading` line will tell us whether the owner's provider
 * sends a constant bearing that passes finite() forever. This detector
 * watches for exactly that: a bearing with zero variance for longer than
 * STUCK_BEARING_WINDOW_MS while the derived course turned at least
 * STUCK_COURSE_DELTA_DEG inside the same window. Both conditions matter —
 * a bearing frozen while the car genuinely does not move is normal.
 *
 * Pure, RAM-only, table-tested. Once fired it stays fired until the bearing
 * moves again (or reset()), so a provider that resumes sending real values
 * is trusted again immediately.
 */
export class StuckBearingGuard {
  private sinceMs: number | null = null;
  private anchorBearing: number | null = null;
  private anchorCourse: number | null = null;
  private peakCourseDelta = 0;
  private stuck = false;

  /** Feed one sample (bearing and/or derived course). */
  push(
    bearingDeg: number | null | undefined,
    courseDeg: number | null | undefined,
    tMs: number,
  ): void {
    if (!finite(bearingDeg)) {
      // No bearing at all: the window keeps its start (the last known value
      // is still the only one the provider ever sent) but course progress
      // inside it still counts.
      this.trackCourse(courseDeg);
      return;
    }
    if (
      this.anchorBearing === null ||
      headingDeltaDeg(bearingDeg, this.anchorBearing) > HEADING.STUCK_BEARING_EPS_DEG
    ) {
      // Real movement: restart the window and clear the latch.
      this.anchorBearing = bearingDeg;
      this.sinceMs = tMs;
      this.anchorCourse = finite(courseDeg) ? courseDeg : null;
      this.peakCourseDelta = 0;
      this.stuck = false;
      return;
    }
    if (this.sinceMs === null) {
      this.sinceMs = tMs;
      this.anchorCourse = finite(courseDeg) ? courseDeg : null;
      this.peakCourseDelta = 0;
    }
    this.trackCourse(courseDeg);
    if (
      !this.stuck &&
      this.sinceMs !== null &&
      tMs - this.sinceMs > HEADING.STUCK_BEARING_WINDOW_MS &&
      this.anchorCourse !== null &&
      this.peakCourseDelta >= HEADING.STUCK_COURSE_DELTA_DEG
    ) {
      this.stuck = true;
    }
  }

  private trackCourse(courseDeg: number | null | undefined): void {
    if (!finite(courseDeg)) return;
    if (this.anchorCourse === null) {
      this.anchorCourse = courseDeg;
      this.peakCourseDelta = 0;
      return;
    }
    this.peakCourseDelta = Math.max(
      this.peakCourseDelta,
      headingDeltaDeg(courseDeg, this.anchorCourse),
    );
  }

  /** True when the bearing is proven stuck (fusion drops it). */
  fired(): boolean {
    return this.stuck;
  }

  reset(): void {
    this.sinceMs = null;
    this.anchorBearing = null;
    this.anchorCourse = null;
    this.peakCourseDelta = 0;
    this.stuck = false;
  }
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
  private source: HeadingSource = null;
  private guard = new StuckBearingGuard();

  /**
   * Feed one sample. Returns the smoothed heading in degrees [0, 360), or
   * null while suppressed (no usable source for the current motion state).
   */
  push(sample: HeadingSample): number | null {
    const speedOk =
      Number.isFinite(sample.speedMps) && sample.speedMps >= HEADING.MIN_SPEED_MPS;
    this.guard.push(sample.headingDeg, sample.courseDeg, sample.tMs);

    // M2-O9 priority, in order. A proven-stuck bearing is withdrawn first,
    // so it cannot win even as a fallback.
    const trustedBearing = this.guard.fired() ? null : sample.headingDeg;
    const order: Array<[Exclude<HeadingSource, null>, number | null | undefined]> =
      speedOk
        ? [
            ['course', sample.courseDeg],
            ['bearing', trustedBearing],
            ['orientation', sample.orientationDeg],
          ]
        : [['orientation', sample.orientationDeg]];
    const heading = fuseHeadingDeg(...order.map(([, deg]) => deg));
    const source: HeadingSource =
      heading === null ? null : (order.find(([, deg]) => deg === heading)?.[0] ?? null);

    this.reason = this.suppressionReason(sample, speedOk, heading !== null);
    this.source = heading === null ? null : source;

    if (heading === null) {
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
      // Parked rotation follows in the 200-300 ms family (M2-O9 / M2-O6
      // taste); at speed the M2-O4 1.5 s constant keeps the tape calm.
      const tauMs = speedOk ? HEADING.TAU_MS : HEADING.TAU_ORIENTATION_MS;
      const alpha = 1 - Math.exp(-dtMs / tauMs);
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

  /**
   * Suppression reason (SPEC M2-O9 extends M2-O8):
   *  - accepted            -> null,
   *  - stationary + compass reported but dead -> 'no-compass' (the only
   *    stationary source is missing — the overlay line for it reads
   *    `orientation: off`),
   *  - stationary + a GPS source the gate holds -> 'low-speed',
   *  - nothing finite at all -> 'no-source'.
   */
  private suppressionReason(
    sample: HeadingSample,
    speedOk: boolean,
    accepted: boolean,
  ): HeadingSuppression {
    if (accepted) return null;
    if (!speedOk) {
      if (sample.orientationDeg !== undefined && !finite(sample.orientationDeg)) {
        return 'no-compass';
      }
      if (finite(sample.headingDeg) || finite(sample.courseDeg)) return 'low-speed';
      return 'no-source';
    }
    return 'no-source';
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
   * Which source produced the last accepted sample: 'course', 'bearing' or
   * 'orientation' (M2-O9 — the tape dims an orientation heading because it
   * is the phone's attitude, not direction of travel). Null while
   * suppressed or before the first push.
   */
  lastSource(): HeadingSource {
    return this.source;
  }

  /** True while the stuck-bearing guard has withdrawn the provider bearing. */
  bearingStuck(): boolean {
    return this.guard.fired();
  }

  /**
   * Why the last sample was suppressed: 'no-compass' (parked, compass dead),
   * 'no-source' (no usable source) or 'low-speed' (a GPS source existed but
   * the gate held it below the speed floor).
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
    this.source = null;
    this.guard.reset();
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
