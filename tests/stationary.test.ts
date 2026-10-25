import { describe, expect, it } from 'vitest';
import { StationaryGate } from '../src/core/stationary';
import { PIPELINE } from '../src/core/types';

// A stationary car sits at ~one coordinate with sub-metre drift.
function jitter(lat: number, lon: number, i: number): { lat: number; lon: number } {
  // ~ +/- 0.1 m of drift, well below the 3 m displacement threshold.
  const d = (i % 3) * 0.000001 - 0.000001;
  return { lat: lat + d, lon: lon + d };
}

describe('StationaryGate hysteresis', () => {
  it('engages after a full window of low displacement', () => {
    const g = new StationaryGate();
    let engaged = false;
    for (let i = 0; i < PIPELINE.STATIONARY_WINDOW + 1; i++) {
      engaged = g.push(jitter(12.97, 77.59, i), 0.5);
    }
    expect(engaged).toBe(true);
    expect(g.isStationary()).toBe(true);
  });

  it('does not engage before the window is full', () => {
    const g = new StationaryGate();
    for (let i = 0; i < PIPELINE.STATIONARY_WINDOW - 1; i++) {
      g.push(jitter(12.97, 77.59, i), 0.5);
    }
    expect(g.isStationary()).toBe(false);
  });

  it('requires TWO consecutive moving samples to leave (hysteresis)', () => {
    const g = new StationaryGate();
    for (let i = 0; i < 6; i++) g.push(jitter(12.97, 77.59, i), 0.2);
    expect(g.isStationary()).toBe(true);

    // One moving sample: still parked (needs two).
    g.push({ lat: 12.98, lon: 77.60 }, 8);
    expect(g.isStationary()).toBe(true);
    // Second moving sample: now leaves.
    g.push({ lat: 12.99, lon: 77.61 }, 9);
    expect(g.isStationary()).toBe(false);
  });

  it('resets the restart counter if a moving sample regresses', () => {
    const g = new StationaryGate();
    for (let i = 0; i < 6; i++) g.push(jitter(12.97, 77.59, i), 0.2);
    expect(g.isStationary()).toBe(true);

    g.push({ lat: 12.98, lon: 77.60 }, 8); // moving sample 1
    g.push(jitter(12.97, 77.59, 1), 0.1);  // regresses -> counter reset
    expect(g.isStationary()).toBe(true);
    g.push({ lat: 12.98, lon: 77.60 }, 8); // moving sample 1 again
    expect(g.isStationary()).toBe(true);   // still needs a second
    g.push({ lat: 12.99, lon: 77.61 }, 9); // moving sample 2
    expect(g.isStationary()).toBe(false);
  });
});
