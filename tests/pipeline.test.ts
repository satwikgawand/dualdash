import { describe, expect, it } from 'vitest';
import { SpeedProcessor } from '../src/core/pipeline';
import { PIPELINE, RawFix } from '../src/core/types';

/** Build a RawFix with sensible moving-car defaults. */
function fix(opts: Partial<RawFix> & { elapsedRealtimeNanos: bigint }): RawFix {
  return {
    speedMps: 25,
    hasSpeed: true,
    accuracyM: 5,
    speedAccuracyMps: 1,
    hasSpeedAccuracy: true,
    lat: 12.9716,
    lon: 77.5946,
    headingDeg: 90,
    ...opts,
  };
}

/** Feed a 1 Hz moving trace at constant speed, advancing position east. */
function feed(
  p: SpeedProcessor,
  count: number,
  speed: number,
  startNs: bigint,
  lat = 12.9716,
): bigint {
  let ns = startNs;
  for (let i = 0; i < count; i++) {
    p.pushFix(
      fix({
        speedMps: speed,
        lat: lat + i * 0.00025, // ~27 m per second -> well above stationary threshold
        lon: 77.5946,
        elapsedRealtimeNanos: ns,
      }),
    );
    ns += 1_000_000_000n; // +1 s
  }
  return ns;
}

describe('SpeedProcessor: moving trace', () => {
  it('reports a steady speed at the median value once the window fills', () => {
    const p = new SpeedProcessor();
    let ns = 0n;
    for (let i = 0; i < 8; i++) {
      p.pushFix(
        fix({ speedMps: 25, lat: 12.9716 + i * 0.00025, elapsedRealtimeNanos: ns }),
      );
      ns += 1_000_000_000n;
    }
    const snap = p.getSnapshot(ns);
    expect(snap.fixState).toBe('LIVE');
    expect(snap.isStationary).toBe(false);
    // 25 m/s = 90 km/h.
    expect(Math.round(snap.displaySpeedMps * 3.6)).toBe(90);
  });
});

describe('SpeedProcessor: median kills single-sample spikes', () => {
  it('rejects a one-sample 55 m/s GPS spike', () => {
    const p = new SpeedProcessor();
    let ns = 0n;
    for (let i = 0; i < 6; i++) {
      p.pushFix(
        fix({ speedMps: 25, lat: 12.9716 + i * 0.00025, elapsedRealtimeNanos: ns }),
      );
      ns += 1_000_000_000n;
    }
    // One spike sample.
    p.pushFix(fix({ speedMps: 55, lat: 12.9716 + 6 * 0.00025, elapsedRealtimeNanos: ns }));
    ns += 1_000_000_000n;
    const snap = p.getSnapshot(ns);
    // Median (window 5) removes the 55 outlier; display stays ~25 m/s.
    expect(snap.displaySpeedMps).toBeLessThan(35);
    expect(snap.displaySpeedMps).toBeGreaterThan(15);
  });
});

describe('SpeedProcessor: jitter-at-rest synthetic trace', () => {
  it('converges to a hard 0.0 and latches stationary on a parked car', () => {
    const p = new SpeedProcessor();
    let ns = 0n;
    // A parked car reporting 0-3 km/h of drift with sub-metre position jitter.
    const drift = [0.4, 0.2, 0.6, 0.3, 0.5, 0.2, 0.4, 0.1, 0.5, 0.3];
    for (let i = 0; i < drift.length; i++) {
      p.pushFix(
        fix({
          speedMps: drift[i],
          lat: 12.9716 + (i % 3) * 0.000004,
          lon: 77.5946 + (i % 2) * 0.000004,
          elapsedRealtimeNanos: ns,
        }),
      );
      ns += 1_000_000_000n;
    }
    const snap = p.getSnapshot(ns);
    expect(snap.isStationary).toBe(true);
    expect(snap.displaySpeedMps).toBe(0);
  });
});

describe('SpeedProcessor: tunnel gap (never fake 0.0)', () => {
  it('freezes last good speed and goes STALE then LOST — never 0.0', () => {
    const p = new SpeedProcessor();
    let ns = feed(p, 8, 25, 0n); // moving at 25 m/s
    const before = p.getSnapshot(ns);
    expect(before.fixState).toBe('LIVE');
    expect(before.displaySpeedMps).toBeGreaterThan(15);

    // Tunnel: no fixes arrive. Advance the clock only.
    const stale = p.getSnapshot(ns + 5_000_000_000n); // age 5 s
    expect(stale.fixState).toBe('STALE');
    expect(stale.showNoFix).toBe(true);
    expect(stale.displaySpeedMps).toBeGreaterThan(15); // frozen, not zeroed

    const lost = p.getSnapshot(ns + 15_000_000_000n); // age 15 s
    expect(lost.fixState).toBe('LOST');
    expect(lost.showNoFix).toBe(true);
    expect(lost.displaySpeedMps).toBeGreaterThan(15); // still frozen, never 0.0
  });
});

describe('SpeedProcessor: hasSpeed() gate', () => {
  it('does not zero the display when a fix lacks speed (no fallback available)', () => {
    const p = new SpeedProcessor();
    let ns = feed(p, 8, 25, 0n);
    const moving = p.getSnapshot(ns);
    const good = moving.displaySpeedMps;
    expect(good).toBeGreaterThan(15);

    // A fix with hasSpeed=false and no valid fallback (no meaningful position move).
    p.pushFix(
      fix({
        hasSpeed: false,
        speedMps: 0,
        lat: 12.9716,
        lon: 77.5946,
        elapsedRealtimeNanos: ns,
      }),
    );
    ns += 1_000_000_000n;
    const snap = p.getSnapshot(ns);
    // The zero-valued hasSpeed fix must NOT be treated as a real 0.0 measurement.
    expect(snap.displaySpeedMps).toBeGreaterThan(15);
  });
});

describe('SpeedProcessor: acceleration clamp through the pipeline', () => {
  it('a sustained launch is tracked but capped by the 8 m/s^2 bound', () => {
    const p = new SpeedProcessor();
    // Feed an impossible instant launch 0 -> 40 in one step at 1 Hz.
    let ns = 0n;
    p.pushFix(fix({ speedMps: 0, lat: 12.9716, elapsedRealtimeNanos: ns }));
    ns += 1_000_000_000n;
    p.pushFix(fix({ speedMps: 40, lat: 12.9716 + 0.00025, elapsedRealtimeNanos: ns }));
    ns += 1_000_000_000n;
    const snap = p.getSnapshot(ns);
    // The clamp bounds the step to <= 8 m/s in the first second.
    expect(snap.displaySpeedMps).toBeLessThanOrEqual(PIPELINE.MAX_ACCEL_MPS2 + 1);
  });
});

describe('SpeedProcessor: reset', () => {
  it('clears all state back to never-had-a-fix', () => {
    const p = new SpeedProcessor();
    feed(p, 6, 20, 0n);
    p.reset();
    const snap = p.getSnapshot(0n);
    expect(snap.fixState).toBe('LOST');
    expect(snap.confidence).toBe('frozen');
    expect(snap.displaySpeedMps).toBe(0);
  });
});
