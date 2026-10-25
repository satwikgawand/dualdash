// Device SpeedSource: wraps @capacitor/geolocation watchPosition into the
// SpeedSource seam (stack.md R1). UI never imports Capacitor directly.
//
// Chain ownership (SPEC M1-O7): this class owns
//   permission -> location provider -> native watch -> callbacks -> diagnostics.
// Every link is checked and reported; no link fails silently.
//
//   - First launch asks for the permission explicitly (requestPermissions).
//     A coarse-only grant (Android 12+ "Approximate") counts as granted —
//     precise is tracked separately, not as a failure.
//   - A reconcile loop re-reads permission + provider every RECONCILE_MS and
//     (re)starts the watch the moment both are OK, so a grant that lands after
//     mount, or Location being switched back on, is not lost.
//   - Every native error is recorded (code + message) and mapped to state
//     effects (see locationErrors.ts) before it can reach the UI.
//
// Two device facts drive the watch settings below:
//   1. The plugin arms a first-emission watchdog at `timeout`
//      (IONGLOCController.addWatch -> emitOrTimeoutBeforeFirstEmission ->
//      IONGLOCLocationRetrievalTimeoutException). If it fires BEFORE the first
//      fix, the watch call rejects while keepAlive is still false, so
//      MessageHandler.sendResponseMessage sends save=false and the bridge
//      deletes the JS callback (native-bridge.js: callbacks.delete) — that
//      watch can never deliver another position. `timeout` must therefore be
//      generous: 15 s for a cold GNSS start, not the 1 s we shipped before.
//   2. `interval` defaults to `timeout` and `minimumUpdateInterval` defaults
//      to 5000 ms. Both are set explicitly here so the stream really is ~1 Hz
//      and fixes stay inside the 3 s LIVE window (core PIPELINE.LIVE_MAX_AGE_MS).
//
// Fix timestamps come straight from performance.now() — the same monotonic
// clock useSpeed's staleness tick uses. The old code subtracted a start()
// anchor captured AFTER the permission dialog, which back-dated every fix by
// the grant duration and forced fixState=LOST no matter how good the signal.

import { Geolocation } from '@capacitor/geolocation';
import {
  FixListener,
  LocationPermissionState,
  SourceDiagnostics,
  SpeedSource,
} from './SpeedSource';
import { RawFix } from '../core/types';
import {
  effectsForErrorCode,
  permissionFromStatus,
  readNativeError,
} from './locationErrors';

const NS_PER_MS = 1_000_000;
/** First-fix deadline. The plugin default is 10000 ms; cold GNSS needs it. */
const FIRST_FIX_TIMEOUT_MS = 15_000;
/** Steady-state cadence (~1 Hz) — both are Android-only plugin options. */
const UPDATE_INTERVAL_MS = 1_000;
const MIN_UPDATE_INTERVAL_MS = 1_000;
/** How often permission + provider are re-read while running. */
const RECONCILE_MS = 2_000;

/** Narrow a possibly-null numeric field to a finite number or NaN. */
function finite(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
}

export class CapacitorSpeedSource implements SpeedSource {
  private watchId: string | null = null;
  private listeners = new Set<FixListener>();
  private diagListeners = new Set<(d: SourceDiagnostics) => void>();
  private running = false;
  private busy = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private diag: SourceDiagnostics = {
    permission: 'unknown',
    precise: false,
    providerEnabled: null,
    watchActive: false,
    lastErrorCode: null,
    lastErrorMessage: null,
  };

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Explicit first-launch permission request (SPEC M1-O7).
    if (this.diag.permission !== 'granted') {
      await this.requestPermission();
    }
    await this.reconcile();

    if (this.timer === null) {
      this.timer = setInterval(() => {
        void this.reconcile();
      }, RECONCILE_MS);
    }
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.dropWatch();
  }

  onFix(cb: FixListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  isActive(): boolean {
    return this.diag.watchActive;
  }

  diagnostics(): SourceDiagnostics {
    return { ...this.diag };
  }

  onDiagnostics(cb: (d: SourceDiagnostics) => void): () => void {
    this.diagListeners.add(cb);
    cb({ ...this.diag });
    return () => this.diagListeners.delete(cb);
  }

  async requestPermission(): Promise<LocationPermissionState> {
    try {
      const status = await Geolocation.requestPermissions();
      this.applyPermission(status);
    } catch (e) {
      this.applyNativeError(e); // e.g. OS-PLUG-GLOC-0007: services off
    }
    await this.reconcile();
    return this.diag.permission;
  }

  /**
   * Re-read permission + provider, then arm the watch if — and only if — both
   * allow it. Called on start, from the timer, and after a permission attempt.
   */
  private async reconcile(): Promise<void> {
    if (!this.running || this.busy) return;
    this.busy = true;
    try {
      try {
        // checkPermissions also verifies location services (the plugin rejects
        // with OS-PLUG-GLOC-0007 when they are off) — one call reads both.
        const status = await Geolocation.checkPermissions();
        this.applyPermission(status);
        this.patch({ providerEnabled: true });
      } catch (e) {
        this.applyNativeError(e);
      }

      const canWatch =
        this.diag.permission === 'granted' && this.diag.providerEnabled !== false;

      if (canWatch) {
        await this.ensureWatch();
      } else if (this.watchId !== null) {
        this.dropWatch(); // permission revoked or provider off: the watch is dead
      }
    } finally {
      this.busy = false;
    }
  }

  private async ensureWatch(): Promise<void> {
    if (this.watchId !== null) return;
    try {
      this.watchId = await Geolocation.watchPosition(
        {
          // High accuracy only when FINE is granted: on Android 12+ asking for
          // fine when only "Approximate" was granted would raise a second,
          // surprise permission dialog at watch start.
          enableHighAccuracy: this.diag.precise,
          maximumAge: 0,
          timeout: FIRST_FIX_TIMEOUT_MS,
          interval: UPDATE_INTERVAL_MS,
          minimumUpdateInterval: MIN_UPDATE_INTERVAL_MS,
        },
        (pos, err) => {
          if (err) {
            this.onWatchError(err);
            return;
          }
          if (!pos) return;
          this.onPosition(pos);
        },
      );
      this.patch({ watchActive: true });
    } catch (e) {
      // watchPosition can still reject (permission race, manifest, services).
      this.applyNativeError(e);
      this.watchId = null;
      this.patch({ watchActive: false });
    }
  }

  private onPosition(pos: { coords: RawFixCoords }): void {
    // A fix proves the chain: clear the last error so the overlay and the chip
    // show live state instead of a stale failure.
    if (this.diag.lastErrorCode !== null) {
      this.patch({ lastErrorCode: null, lastErrorMessage: null });
    }
    const c = pos.coords;
    const monoNs = BigInt(Math.round(performance.now() * NS_PER_MS));
    const fix: RawFix = {
      speedMps: c.speed ?? 0,
      hasSpeed: c.speed !== null && c.speed !== undefined && Number.isFinite(c.speed),
      accuracyM: finite(c.accuracy),
      speedAccuracyMps: Number.NaN, // plugin does not expose speed accuracy
      hasSpeedAccuracy: false, // so the pipeline's speed-accuracy gate is inert here
      lat: c.latitude,
      lon: c.longitude,
      elapsedRealtimeNanos: monoNs,
      headingDeg: finite(c.heading),
    };
    for (const cb of this.listeners) cb(fix);
  }

  /**
   * One error is enough to end a watch that has not fixed yet: the plugin
   * rejects the callback call, the bridge drops the channel, and nothing more
   * arrives. Record it, release our id, and let reconcile() re-arm.
   */
  private onWatchError(err: unknown): void {
    this.applyNativeError(err);
    this.dropWatch();
  }

  private dropWatch(): void {
    const id = this.watchId;
    this.watchId = null;
    if (id !== null) {
      void Geolocation.clearWatch({ id }).catch(() => undefined);
    }
    if (this.diag.watchActive) this.patch({ watchActive: false });
  }

  private applyPermission(status: { location?: string | null; coarseLocation?: string | null }): void {
    const read = permissionFromStatus(status);
    this.patch({ permission: read.permission, precise: read.precise });
  }

  private applyNativeError(e: unknown): void {
    const { code, message } = readNativeError(e);
    const effects = effectsForErrorCode(code);
    this.patch({
      lastErrorCode: code,
      lastErrorMessage: message,
      ...(effects.permission !== undefined ? { permission: effects.permission } : {}),
      ...(effects.providerEnabled !== undefined
        ? { providerEnabled: effects.providerEnabled }
        : {}),
    });
  }

  private patch(part: Partial<SourceDiagnostics>): void {
    this.diag = { ...this.diag, ...part };
    const snapshot: SourceDiagnostics = { ...this.diag };
    for (const cb of this.diagListeners) cb(snapshot);
  }
}

/** The coords shape the plugin delivers (narrowed to what the pipeline uses). */
interface RawFixCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
}
