// ThresholdMonitor: the M2 over-speed line (SPEC M2-O3).
//
// Pure logic. The driver sets a limit with the quick stepper; crossing above
// it fires an alert (haptic + screen-edge flash), and while the speed stays
// over the line the alert re-fires at most once per REFIRE_MS. A ~1 km/h
// hysteresis stops the buzz dancing at the boundary: after a fire the alert
// stays "latched" until the speed falls a full hysteresis band below the
// line. All state is RAM-only (SPEC M1-O5).

import { convert } from '../core/units';
import { ALERT } from './constants';

export class ThresholdMonitor {
  private limitKmh: number | null = null;
  /** False once fired, until the speed drops HYSTERESIS_KMH below the line. */
  private armed = true;
  private over = false;
  private lastAlertMs: number | null = null;

  /** Set or clear the line. Any change re-arms the alert immediately. */
  setLimit(kmh: number | null): void {
    this.limitKmh = kmh === null || !Number.isFinite(kmh) ? null : Math.max(ALERT.MIN_LIMIT_KMH, kmh);
    this.armed = true;
    this.over = false;
  }

  limit(): number | null {
    return this.limitKmh;
  }

  isOver(): boolean {
    return this.over;
  }

  lastAlertAt(): number | null {
    return this.lastAlertMs;
  }

  /**
   * Feed one speed sample. Returns true exactly when this sample must fire
   * the alert (haptic + flash). Crossing fires once; while over, re-fires at
   * most every REFIRE_MS; re-arms only after falling HYSTERESIS_KMH below.
   */
  push(speedMps: number, nowMs: number): boolean {
    if (this.limitKmh === null) {
      this.over = false;
      this.armed = true;
      return false;
    }
    if (!Number.isFinite(speedMps)) return false;

    const limitMps = this.limitKmh / 3.6;
    const hysteresisMps = ALERT.HYSTERESIS_KMH / 3.6;

    if (!this.armed) {
      // Latched: only a clear drop below the line re-arms the alert.
      if (speedMps < limitMps - hysteresisMps) {
        this.armed = true;
        this.over = false;
      } else {
        // Still in the hysteresis band: report "over" honestly, but never buzz.
        this.over = speedMps > limitMps;
      }
      return false;
    }

    if (speedMps > limitMps) {
      this.over = true;
      if (this.lastAlertMs === null || nowMs - this.lastAlertMs >= ALERT.REFIRE_MS) {
        this.lastAlertMs = nowMs;
        return true;
      }
      return false;
    }

    this.over = false;
    return false;
  }

  /**
   * The speed feed is frozen (STALE/LOST: we are holding the last good
   * value, SPEC M1-O7). An alert on a held value would be a fake reading:
   * show "not over" and fire nothing. The line, the arm state and the
   * cadence clock survive, so a live sample resumes where we left off.
   */
  suspend(): void {
    this.over = false;
  }

  reset(): void {
    this.limitKmh = null;
    this.armed = true;
    this.over = false;
    this.lastAlertMs = null;
  }
}

/**
 * Quick-stepper arithmetic (pure). Deltas are km/h (+/-5, +/-10).
 * With no line set, the first tap bases the limit on the current speed,
 * snapped to the 5 km/h grid, plus the delta — so +5 from 84.3 km/h gives
 * 90, not 89. Later taps move the existing line by the delta. The line
 * never goes below MIN_LIMIT_KMH.
 */
export function stepThreshold(
  limitKmh: number | null,
  currentSpeedMps: number,
  deltaKmh: number,
): number {
  const speedKmh = Number.isFinite(currentSpeedMps) ? convert(currentSpeedMps, 'kmh') : 0;
  const base = limitKmh === null || !Number.isFinite(limitKmh) ? speedKmh : limitKmh;
  const snapped = Math.round((base + deltaKmh) / ALERT.STEP_KMH) * ALERT.STEP_KMH;
  return Math.max(ALERT.MIN_LIMIT_KMH, snapped);
}
