// Derived course: the heading fallback for devices that never fill
// coords.heading (SPEC M2-O8).
//
// On Android, Location.hasBearing() is false at rest and stays false on many
// providers even while moving, so the plugin delivers coords.heading: null
// for long stretches. The compass filter (M2-O4) suppresses forever when its
// only input is null — that is the "tape looks right but never moves" bug.
//
// This module recovers a course over the ground from consecutive fixes:
// the initial bearing (azimuth) between the two fixes that are at least
// COURSE.MIN_DERIVE_DISPLACEMENT_M apart. Sub-floor fixes do NOT move the
// anchor — displacement accumulates against it — so a slowly creeping car
// still produces a course once it has travelled the floor, while jitter
// inside the error circle never does.
//
// Pure logic. Fusion with the device bearing and the phone compass happens
// in HeadingFilter (SPEC M2-O9: moving = course -> bearing -> orientation;
// stationary = orientation only); the M2-O4 speed gate and smoothing treat
// a derived course exactly like a bearing.

import { haversineM, PosSample } from '../core/stationary';
import { COURSE } from './constants';

/**
 * Initial bearing (true course) from a to b in degrees [0, 360), 0 = north,
 * 90 = east. Standard spherical azimuth (sin/cos of the local deltas).
 */
export function initialBearingDeg(a: PosSample, b: PosSample): number {
  const toRad = Math.PI / 180;
  const la1 = a.lat * toRad;
  const la2 = b.lat * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Stateful course derivation. Feed one position per fix with push(); read
 * the last derived course with value() (null until enough travel). The
 * anchor only advances when the displacement floor is crossed, so slow
 * movement accumulates instead of being lost sample by sample.
 */
export class CourseDeriver {
  private anchor: PosSample | null = null;
  private courseDeg: number | null = null;

  /** Ingest one fix position. Non-finite positions are ignored. */
  push(pos: PosSample): void {
    if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return;
    if (this.anchor === null) {
      this.anchor = pos;
      return;
    }
    if (haversineM(this.anchor, pos) >= COURSE.MIN_DERIVE_DISPLACEMENT_M) {
      this.courseDeg = initialBearingDeg(this.anchor, pos);
      this.anchor = pos;
    }
  }

  /** Last derived course in degrees, or null until the floor was crossed. */
  value(): number | null {
    return this.courseDeg;
  }

  reset(): void {
    this.anchor = null;
    this.courseDeg = null;
  }
}
