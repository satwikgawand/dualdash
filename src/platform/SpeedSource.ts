// SpeedSource seam (stack.md condition C3). The UI and the pipeline depend only
// on this interface; the device implementation wraps @capacitor/geolocation and
// a mock implementation backs browser dev + tests. Swapping in a native plugin
// later must not require touching pipeline or UI code.
//
// M1-O7 (2026-10-25): the seam now also carries the health of the
// permission -> provider -> watch chain, so the UI can name each failure state
// instead of collapsing every failure into one "signal lost" chip.

import { RawFix } from '../core/types';

export type FixListener = (fix: RawFix) => void;

/**
 * Runtime location permission as the UI reasons about it.
 * - 'granted'  : at least ACCESS_COARSE_LOCATION is granted.
 * - 'denied'   : refused; on Android this can become permanent ("don't ask").
 * - 'prompt'   : never answered; a system request can still show a dialog.
 * - 'unknown'  : not read yet (no successful check since launch).
 */
export type LocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

/** Health of the location chain, published by the source, rendered by the UI. */
export interface SourceDiagnostics {
  permission: LocationPermissionState;
  /** True when ACCESS_FINE_LOCATION is granted; false = approximate only. */
  precise: boolean;
  /** Device Location services (quick settings). null = not checked yet. */
  providerEnabled: boolean | null;
  /** True while a native watch is armed. */
  watchActive: boolean;
  /** Last plugin error code (e.g. 'OS-PLUG-GLOC-0010'), null when clean. */
  lastErrorCode: string | null;
  /** Message of that last error, null when clean. */
  lastErrorMessage: string | null;
}

export interface SpeedSource {
  /**
   * Begin the ~1 Hz fused stream. Asks for permission on first launch, then
   * re-checks permission + provider on a timer and (re)starts the watch the
   * moment both are OK. Resolves without throwing on permission/provider
   * failure: those are reported through diagnostics(), not as exceptions.
   */
  start(): Promise<void>;
  /** Stop the stream and release resources. Safe to call when not started. */
  stop(): void;
  /** Subscribe to raw fixes. Returns an unsubscribe function. */
  onFix(cb: FixListener): () => void;
  /** Whether the underlying watch is currently active. */
  isActive(): boolean;
  /** Snapshot of the chain health (debug overlay). */
  diagnostics(): SourceDiagnostics;
  /** Subscribe to chain-health updates. Returns an unsubscribe function. */
  onDiagnostics(cb: (d: SourceDiagnostics) => void): () => void;
  /**
   * Explicit runtime permission request plus an immediate chain re-check.
   * Backs the LOCATION NEEDED [Allow], LOCATION DENIED [Retry] and
   * LOCATION OFF [Re-check] affordances. Resolves with the permission state
   * after the attempt.
   */
  requestPermission(): Promise<LocationPermissionState>;
}
