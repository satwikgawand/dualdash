// DualDash core domain types.
// This module is pure and platform-free: no React, no Capacitor imports.

/** A single raw GNSS/fused fix as delivered by a SpeedSource. */
export interface RawFix {
  /** Speed in metres per second, from Location.getSpeed(). Only valid when hasSpeed is true. */
  speedMps: number;
  /** Location.hasSpeed() gate. When false, speedMps is "unknown" and must not be treated as 0. */
  hasSpeed: boolean;
  /** Horizontal accuracy radius in metres (Location.getAccuracy()). NaN when unknown. */
  accuracyM: number;
  /** 68th-percentile speed uncertainty in m/s (getSpeedAccuracyMetersPerSecond). NaN when unknown. */
  speedAccuracyMps: number;
  /** Location.hasSpeedAccuracy() gate. */
  hasSpeedAccuracy: boolean;
  /** WGS84 latitude in degrees. NaN when unknown. */
  lat: number;
  /** WGS84 longitude in degrees. NaN when unknown. */
  lon: number;
  /** Monotonic nanosecond timestamp (Location.getElapsedRealtimeNanos()). NEVER wall clock. */
  elapsedRealtimeNanos: bigint;
  /** True-course in degrees, 0 = north, or NaN when unknown. */
  headingDeg: number;
}

/** Coarse fix-quality state driven by fix age (gps-speed.md section 5). */
export type FixState = 'LIVE' | 'STALE' | 'LOST';

/**
 * Confidence tag for the displayed speed.
 * - 'live'    : fresh GNSS Doppler speed from this fix.
 * - 'derived' : distance/time fallback (lower confidence; hasSpeed was false).
 * - 'frozen'  : no recent fix; we hold the last good value (never 0.0-for-missing).
 */
export type SpeedConfidence = 'live' | 'derived' | 'frozen';

/** The single object the UI renders. Produced by SpeedProcessor.getSnapshot(). */
export interface DisplayState {
  /** Speed in metres per second to show on screen. Never NaN. */
  displaySpeedMps: number;
  /** Whether displaySpeedMps is a real measurement or a frozen hold. */
  confidence: SpeedConfidence;
  /** LIVE / STALE / LOST from the fix-age state machine. */
  fixState: FixState;
  /** Milliseconds since the last accepted fix (monotonic). Infinity when we have never had a fix. */
  fixAgeMs: number | null;
  /** Horizontal accuracy in metres for the last accepted fix, or null. */
  accuracyM: number | null;
  /** Heading in degrees for the last accepted fix, or null. */
  headingDeg: number | null;
  /** True when the stationary gate has latched (parked). Display force-zeroes while true. */
  isStationary: boolean;
  /** True when a "NO FIX" chip should be visible (STALE or LOST). */
  showNoFix: boolean;
}

/** Threshold constants, all traceable to gps-speed.md. */
export const PIPELINE = {
  /** Rolling median window (gps-speed.md section 3.2: window 5). */
  MEDIAN_WINDOW: 5,
  /** Hard physical acceleration bound in m/s^2 (section 3.2: 8, ~0.8 g). */
  MAX_ACCEL_MPS2: 8,
  /** Discard moving samples whose speed accuracy exceeds this (section 1.2: 3 m/s). */
  MAX_SPEED_ACCURACY_MPS: 3,
  /** Only apply the speed-accuracy gate above this speed (section 1.2: speed > 2 m/s). */
  SPEED_ACCURACY_GATE_SPEED_MPS: 2,
  /** Stationary: total displacement over the last N fixes below this is "parked" (section 4: 3 m). */
  STATIONARY_DISPLACEMENT_M: 3,
  /** Stationary: number of fixes in the displacement window (section 4: 5 fixes / 5 s). */
  STATIONARY_WINDOW: 5,
  /** Hysteresis: leave STATIONARY only after this many consecutive moving samples (section 4: two). */
  RESTART_SAMPLES: 2,
  /** Hysteresis: re-start speed must exceed this (section 4: > 2 m/s). */
  RESTART_SPEED_MPS: 2,
  /** Hysteresis: re-start displacement must exceed this (section 4: > 5 m). */
  RESTART_DISPLACEMENT_M: 5,
  /** Fix-age LIVE boundary in ms (section 5: age <= 3 s). */
  LIVE_MAX_AGE_MS: 3000,
  /** Fix-age STALE boundary in ms (section 5: 3-10 s). */
  STALE_MAX_AGE_MS: 10000,
  /** Upper bound the accel clamp trusts for dt in seconds; keeps tunnel gaps from widening the budget. */
  CLAMP_MAX_DT_S: 2,
} as const;
