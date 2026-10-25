// SpeedProcessor: composes the pure pipeline from gps-speed.md section 3.2 in
// the EXACT documented order:
//
//   raw fix
//     -> reject if !hasSpeed() and no valid distance fallback
//     -> reject if speedAccuracy > 3 m/s while speed > 2 m/s
//     -> stationary gate (section 4)
//     -> rolling median, window 5
//     -> acceleration clamp: |dv/dt| <= 8 m/s^2
//     -> display
//
// This module is pure and platform-free. It never calls wall-clock time; the
// caller supplies monotonic nanoseconds (Location.getElapsedRealtimeNanos) so
// the whole thing is deterministic and unit-testable off-device.

import { clampAccel } from './accelClamp';
import { fixStateForAge, showNoFixFor } from './fixState';
import { RollingMedian } from './median';
import { StationaryGate } from './stationary';
import { DisplayState, PIPELINE, RawFix, SpeedConfidence } from './types';

/**
 * Derive a speed from two fixes when hasSpeed() is false (gps-speed.md section
 * 1.3). Returns null unless: both fixes have usable positions, both accuracies
 * are finite, the time base is monotonic, and the distance exceeds the worse of
 * the two accuracy radii (otherwise the delta is inside the error circle).
 */
function deriveSpeed(
  prev: RawFix | null,
  cur: RawFix,
): number | null {
  if (!prev || !Number.isFinite(cur.lat) || !Number.isFinite(cur.lon)) return null;
  if (!Number.isFinite(prev.lat) || !Number.isFinite(prev.lon)) return null;
  const dtNs = cur.elapsedRealtimeNanos - prev.elapsedRealtimeNanos;
  if (dtNs <= 0n) return null;
  const dtS = Number(dtNs) / 1e9;
  if (dtS <= 0) return null;
  // Local import-free haversine would duplicate stationary.ts; use a light one.
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (cur.lat - prev.lat) * toRad;
  const dLon = (cur.lon - prev.lon) * toRad;
  const la = prev.lat * toRad;
  const lb = cur.lat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  const dist = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  const worseAcc = Math.max(prev.accuracyM, cur.accuracyM);
  if (!Number.isFinite(worseAcc) || dist <= worseAcc) return null;
  return dist / dtS;
}

/**
 * Stateful speed pipeline. Feed accepted fixes with pushFix(); read the UI
 * snapshot with getSnapshot(nowNanos). getSnapshot is pure with respect to
 * time: it recomputes fix-state from the supplied monotonic clock.
 */
export class SpeedProcessor {
  private readonly median = new RollingMedian(PIPELINE.MEDIAN_WINDOW);
  private readonly gate = new StationaryGate();

  private lastRaw: RawFix | null = null; // last accepted fix (for fallback + stats)
  private lastAcceptedNs: bigint | null = null; // monotonic time of last accepted fix
  private smoothedMps = 0; // post-median, post-clamp speed actually displayed
  private hasSmoothed = false; // whether smoothedMps is a real measurement yet
  private confidence: SpeedConfidence = 'live';

  /**
   * Ingest one raw fix. Applies every gate in documented order. Fixes that are
   * rejected still update lastRaw for the distance-fallback chain but do NOT
   * touch the median, clamp, or display value.
   */
  pushFix(fix: RawFix): void {
    const prevAccepted = this.lastRaw;
    let speed: number | null = null;
    let conf: SpeedConfidence = 'live';

    // 1. primary = hasSpeed ? getSpeed() : distance fallback (section 1.3).
    if (fix.hasSpeed && Number.isFinite(fix.speedMps)) {
      speed = Math.max(0, fix.speedMps);
      conf = 'live';
    } else {
      const derived = deriveSpeed(prevAccepted, fix);
      if (derived !== null) {
        speed = derived;
        conf = 'derived';
      }
    }

    // 2. speedAccuracy gate (section 1.2): discard noisy moving samples.
    if (
      speed !== null &&
      fix.hasSpeedAccuracy &&
      Number.isFinite(fix.speedAccuracyMps) &&
      speed > PIPELINE.SPEED_ACCURACY_GATE_SPEED_MPS &&
      fix.speedAccuracyMps > PIPELINE.MAX_SPEED_ACCURACY_MPS
    ) {
      speed = null; // rejected; do not feed the display
    }

    if (speed === null) {
      // Rejected for speed purposes, but the position may still move the
      // stationary window. Track position-only so a parked car stays parked.
      if (Number.isFinite(fix.lat) && Number.isFinite(fix.lon)) {
        this.gate.push({ lat: fix.lat, lon: fix.lon }, 0);
      }
      // Remember this fix for the fallback chain but not as "accepted for speed".
      this.lastRaw = fix;
      return;
    }

    // 3. stationary gate (section 4). Runs on position + speed.
    const stationary = this.gate.push(
      { lat: fix.lat, lon: fix.lon },
      speed,
    );

    // Accept the fix as a speed sample (for age + fallback chain).
    this.lastRaw = fix;
    this.lastAcceptedNs = fix.elapsedRealtimeNanos;
    this.confidence = conf;

    if (stationary) {
      // Parked: force 0.0 (a real reading, not a missing-fix hold).
      this.median.reset();
      this.median.push(0);
      this.smoothedMps = 0;
      this.hasSmoothed = true;
      return;
    }

    // 4. rolling median, window 5.
    this.median.push(speed);
    let smoothed = this.median.value();

    // 5. acceleration clamp: |dv/dt| <= 8 m/s^2.
    const dtS = this.lastAcceptedNs !== null && prevAccepted !== null
      ? Number(fix.elapsedRealtimeNanos - prevAccepted.elapsedRealtimeNanos) / 1e9
      : 1; // first real sample: treat as 1 s so the budget is finite
    smoothed = clampAccel(this.hasSmoothed ? this.smoothedMps : null, smoothed, dtS);

    this.smoothedMps = smoothed;
    this.hasSmoothed = true;
  }

  /**
   * Produce the object the UI renders. Pure given nowNanos. When the fix is
   * STALE or LOST we hold the last good smoothed value and raise the NO FIX
   * flag — we never substitute 0.0 for a missing fix.
   */
  getSnapshot(nowNanos: bigint): DisplayState {
    const ageMs =
      this.lastAcceptedNs !== null
        ? Number(nowNanos - this.lastAcceptedNs) / 1_000_000
        : null;
    const fixState = fixStateForAge(ageMs);
    const stationary = this.gate.isStationary();

    let displaySpeedMps: number;
    let confidence: SpeedConfidence;

    if (!this.hasSmoothed) {
      // Never had a usable fix: hold 0 but flag as frozen so the UI knows.
      displaySpeedMps = 0;
      confidence = 'frozen';
    } else if (fixState === 'LIVE') {
      displaySpeedMps = stationary ? 0 : this.smoothedMps;
      confidence = this.confidence;
    } else {
      // STALE / LOST: freeze the last good value (never 0.0-for-missing).
      displaySpeedMps = this.smoothedMps;
      confidence = 'frozen';
    }

    return {
      displaySpeedMps,
      confidence,
      fixState,
      fixAgeMs: ageMs,
      accuracyM:
        this.lastRaw && Number.isFinite(this.lastRaw.accuracyM)
          ? this.lastRaw.accuracyM
          : null,
      headingDeg:
        this.lastRaw && Number.isFinite(this.lastRaw.headingDeg)
          ? this.lastRaw.headingDeg
          : null,
      isStationary: stationary,
      showNoFix: showNoFixFor(fixState),
    };
  }

  reset(): void {
    this.median.reset();
    this.gate.reset();
    this.lastRaw = null;
    this.lastAcceptedNs = null;
    this.smoothedMps = 0;
    this.hasSmoothed = false;
    this.confidence = 'live';
  }

  /** Last accepted fix (may be speed-rejected). */
  lastFix(): RawFix | null {
    return this.lastRaw;
  }

  /** Smoothed display speed in m/s. */
  smoothedSpeed(): number {
    return this.smoothedMps;
  }

  isStationary(): boolean {
    return this.gate.isStationary();
  }
}
