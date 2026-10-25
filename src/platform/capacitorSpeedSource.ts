// Device SpeedSource: wraps @capacitor/geolocation watchPosition into the
// SpeedSource seam (stack.md R1). UI never imports Capacitor directly.
//
// Mapping to gps-speed.md section 2:
//   - enableHighAccuracy: true  -> PRIORITY_HIGH_ACCURACY equivalent
//   - watchPosition             -> continuous ~1 Hz stream
//   - we forward elapsedRealtimeNanos from Date.now() as a monotonic proxy in
//     the WebView (the plugin does not expose getElapsedRealtimeNanos). For a
//     monotonic base we use performance.now() anchored at start; see note below.
//
// The plugin returns coords with speed/accuracy/heading. It does NOT return the
// platform's getElapsedRealtimeNanos, so we synthesise a monotonic clock from
// performance.now() (which is monotonic within a page session). This preserves
// the pipeline's "never wall clock" rule: performance.now() does not jump with
// NTP or user clock changes the way Date.now() can.

import { Geolocation } from '@capacitor/geolocation';
import { FixListener, SpeedSource } from './SpeedSource';
import { RawFix } from '../core/types';

const NS_PER_MS = 1_000_000;

/** Narrow a possibly-null numeric field to a finite number or NaN. */
function finite(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
}

export class CapacitorSpeedSource implements SpeedSource {
  private watchId: string | null = null;
  private listeners = new Set<FixListener>();
  private active = false;
  private anchorPerfMs = 0; // performance.now() at start()

  async start(): Promise<void> {
    if (this.active) return;

    // Runtime permission (stack.md R3). Fine location is required for speed.
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== 'granted') {
      throw new Error('Location permission denied');
    }

    this.anchorPerfMs = performance.now();

    this.watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, maximumAge: 0, timeout: 1000 },
      (pos, err) => {
        if (err || !pos) return;
        const c = pos.coords;
        const monoNs = BigInt(Math.round((performance.now() - this.anchorPerfMs) * NS_PER_MS));
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
      },
    );
    this.active = true;
  }

  stop(): void {
    if (this.watchId !== null) {
      void Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }
    this.active = false;
  }

  onFix(cb: FixListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  isActive(): boolean {
    return this.active;
  }
}
