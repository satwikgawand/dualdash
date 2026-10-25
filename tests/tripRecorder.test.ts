import { describe, expect, it } from 'vitest';
import { TripRecorder } from '../src/core/tripRecorder';
import { RawFix } from '../src/core/types';

const NS_PER_MS = 1_000_000n;

function fix(t: number, lat: number, lon: number): RawFix {
  return {
    speedMps: 20,
    hasSpeed: true,
    accuracyM: 5,
    speedAccuracyMps: 1,
    hasSpeedAccuracy: true,
    lat,
    lon,
    headingDeg: 90,
    elapsedRealtimeNanos: BigInt(t) * NS_PER_MS,
  };
}

describe('TripRecorder', () => {
  it('accumulates distance over a straight moving trace', () => {
    const r = new TripRecorder();
    r.start(0);
    // ~0.0002 deg lat per second near equator-ish -> ~22 m/s.
    for (let i = 0; i < 10; i++) {
      r.addFix(fix(i, 12.9716 + i * 0.0002, 77.5946), 20, i * 1000);
    }
    const s = r.stop(9000);
    expect(s.distanceM).toBeGreaterThan(100);
    expect(s.samples).toBe(10);
    expect(s.maxSpeedMps).toBe(20);
    expect(s.avgSpeedMps).toBeGreaterThan(0);
    expect(s.elapsedMs).toBe(9000);
  });

  it('does not add distance when not running', () => {
    const r = new TripRecorder();
    r.addFix(fix(0, 12.9716, 77.5946), 20, 0);
    const s = r.summary(0);
    expect(s.distanceM).toBe(0);
    expect(s.samples).toBe(0);
  });

  it('tracks max speed across samples', () => {
    const r = new TripRecorder();
    r.start(0);
    r.addFix(fix(0, 12.9716, 77.5946), 10, 0);
    r.addFix(fix(1, 12.9718, 77.5946), 35, 1000);
    r.addFix(fix(2, 12.9720, 77.5946), 22, 2000);
    const s = r.stop(2000);
    expect(s.maxSpeedMps).toBe(35);
  });

  it('ignores absurd teleport segments', () => {
    const r = new TripRecorder();
    r.start(0);
    r.addFix(fix(0, 12.9716, 77.5946), 20, 0);
    // Teleport ~11 km in one second -> segment rejected.
    r.addFix(fix(1, 13.0716, 77.5946), 20, 1000);
    const s = r.stop(1000);
    expect(s.distanceM).toBeLessThan(200);
  });

  it('reset clears everything', () => {
    const r = new TripRecorder();
    r.start(0);
    r.addFix(fix(0, 12.9716, 77.5946), 20, 0);
    r.reset();
    const s = r.summary(0);
    expect(s.distanceM).toBe(0);
    expect(s.samples).toBe(0);
    expect(r.isRunning()).toBe(false);
  });
});
