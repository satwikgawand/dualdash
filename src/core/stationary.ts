// Stationary gate with hysteresis (gps-speed.md section 4).
// A parked car reports 0-3 km/h of GNSS drift. We detect "parked" by low
// displacement over a short window, force the display to 0.0, and require two
// consecutive moving samples to leave the state so it does not flicker at a
// red light.

import { PIPELINE } from './types';

/** One position sample for the displacement window. */
export interface PosSample {
  lat: number;
  lon: number;
}

/** Approximate metres between two WGS84 points (equirectangular, fine at car scale). */
export function haversineM(a: PosSample, b: PosSample): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const la = a.lat * toRad;
  const lb = b.lat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Stateful stationary detector. Feed one position per accepted fix with push(),
 * then read isStationary().
 */
export class StationaryGate {
  private readonly window: PosSample[] = [];
  private stationary = false;
  private restartCount = 0;

  /**
   * Ingest a new position fix and update the latched stationary state.
   * Returns true when the gate is engaged (parked) after this sample.
   */
  push(pos: PosSample, speedMps: number): boolean {
    if (Number.isFinite(pos.lat) && Number.isFinite(pos.lon)) {
      this.window.push(pos);
      if (this.window.length > PIPELINE.STATIONARY_WINDOW) this.window.shift();
    }

    const displacement = this.totalDisplacement();

    if (!this.stationary) {
      // Running: engage if displacement over the window is tiny.
      if (
        this.window.length >= PIPELINE.STATIONARY_WINDOW &&
        displacement < PIPELINE.STATIONARY_DISPLACEMENT_M
      ) {
        this.stationary = true;
        this.restartCount = 0;
      }
    } else {
      // Parked: require RESTART_SAMPLES consecutive samples with both
      // speed and displacement above the hysteresis thresholds.
      if (
        speedMps > PIPELINE.RESTART_SPEED_MPS &&
        displacement > PIPELINE.RESTART_DISPLACEMENT_M
      ) {
        this.restartCount += 1;
        if (this.restartCount >= PIPELINE.RESTART_SAMPLES) {
          this.stationary = false;
          this.restartCount = 0;
        }
      } else {
        this.restartCount = 0;
      }
    }

    return this.stationary;
  }

  /** Sum of consecutive-segment distances across the current window. */
  totalDisplacement(): number {
    if (this.window.length < 2) return 0;
    let d = 0;
    for (let i = 1; i < this.window.length; i++) {
      d += haversineM(this.window[i - 1], this.window[i]);
    }
    return d;
  }

  isStationary(): boolean {
    return this.stationary;
  }

  reset(): void {
    this.window.length = 0;
    this.stationary = false;
    this.restartCount = 0;
  }
}
