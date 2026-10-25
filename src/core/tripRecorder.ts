// Trip accumulator (pure). Runs off the smoothed display speed and fix stream.
// Distance integrates over accepted fix positions; avg/max/elapsed derive from
// the same samples. No platform calls — feed it from the SpeedSource.

import { RawFix } from './types';

const EARTH_R = 6371000;

function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const la = aLat * toRad;
  const lb = bLat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A finished (or in-progress) trip summary. Distances in metres, speeds in m/s. */
export interface TripSummary {
  distanceM: number;
  elapsedMs: number;
  avgSpeedMps: number;
  maxSpeedMps: number;
  startedAtMs: number | null;
  endedAtMs: number | null;
  samples: number;
}

/**
 * Accumulates a single driving session. Call start() to begin, addFix() per
 * accepted fix with the smoothed speed, and stop() to close. avgSpeed uses the
 * distance/elapsed ratio (a HUD "moving average"), not the mean of samples,
 * which would over-weight slow dwell time.
 */
export class TripRecorder {
  private running = false;
  private distanceM = 0;
  private maxSpeedMps = 0;
  private samples = 0;
  private startedAtMs: number | null = null;
  private endedAtMs: number | null = null;
  private lastPos: { lat: number; lon: number } | null = null;
  private lastNs: bigint | null = null;
  // For avg we integrate speed*time.
  private speedTimeIntegral = 0;

  start(nowMs: number): void {
    this.reset();
    this.running = true;
    this.startedAtMs = nowMs;
  }

  stop(nowMs: number): TripSummary {
    this.running = false;
    this.endedAtMs = nowMs;
    return this.summary(nowMs);
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Ingest one accepted fix. `smoothedMps` is the post-pipeline display speed.
   * Distance only advances when the position is valid and the segment is not
   * absurd (guards against a single bad fix teleporting the car).
   */
  addFix(fix: RawFix, smoothedMps: number, nowMs: number): void {
    if (!this.running) return;
    this.samples += 1;

    if (smoothedMps > this.maxSpeedMps) this.maxSpeedMps = smoothedMps;

    if (Number.isFinite(fix.lat) && Number.isFinite(fix.lon)) {
      if (this.lastPos) {
        const seg = haversine(this.lastPos.lat, this.lastPos.lon, fix.lat, fix.lon);
        // Ignore teleport segments > 200 m between ~1 s fixes (>200 m/s).
        if (seg < 200) this.distanceM += seg;
      }
      this.lastPos = { lat: fix.lat, lon: fix.lon };
    }

    // Integrate speed*time for the running average.
    if (this.lastNs !== null) {
      const dtS = Number(fix.elapsedRealtimeNanos - this.lastNs) / 1e9;
      if (dtS > 0 && dtS < 10) this.speedTimeIntegral += smoothedMps * dtS;
    }
    this.lastNs = fix.elapsedRealtimeNanos;
    void nowMs;
  }

  summary(nowMs?: number): TripSummary {
    const end = this.endedAtMs ?? nowMs ?? this.startedAtMs ?? 0;
    const elapsedMs =
      this.startedAtMs !== null ? Math.max(0, end - this.startedAtMs) : 0;
    const elapsedS = elapsedMs / 1000;
    // Prefer speed*time integral; fall back to distance/elapsed when available.
    let avg = 0;
    if (this.speedTimeIntegral > 0 && elapsedS > 0) {
      avg = this.speedTimeIntegral / elapsedS;
    } else if (this.distanceM > 0 && elapsedS > 0) {
      avg = this.distanceM / elapsedS;
    }
    return {
      distanceM: this.distanceM,
      elapsedMs,
      avgSpeedMps: avg,
      maxSpeedMps: this.maxSpeedMps,
      startedAtMs: this.startedAtMs,
      endedAtMs: this.endedAtMs,
      samples: this.samples,
    };
  }

  reset(): void {
    this.running = false;
    this.distanceM = 0;
    this.maxSpeedMps = 0;
    this.samples = 0;
    this.startedAtMs = null;
    this.endedAtMs = null;
    this.lastPos = null;
    this.lastNs = null;
    this.speedTimeIntegral = 0;
  }
}
